/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Shiprocket Controller
 * ─────────────────────────────────────────────────────────────────────────────
 * All admin-facing actions to manage Shiprocket shipments for orders.
 * Routes are protected by admin auth middleware.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { Order, OrderItem, AdminLog, Setting } = require('../models');
const shiprocket = require('../utils/shiprocket');

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Calculate live shipping rate for a given pincode (public endpoint)
// @route   POST /api/shipping/calculate
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const calculateShippingRate = async (req, res, next) => {
  try {
    const { pincode, paymentMethod, weight } = req.body;

    if (!pincode || String(pincode).length < 6) {
      return res.status(400).json({ success: false, error: 'A valid 6-digit pincode is required.' });
    }

    // Fetch admin-configured fallback & free-shipping settings
    const settingsList = await Setting.find({
      key: { $in: ['shippingFallbackRate', 'freeShippingThreshold', 'codFee'] }
    });
    const settingsMap = {};
    settingsList.forEach(s => { settingsMap[s.key] = parseFloat(s.value) || 0; });

    const fallbackRate = settingsMap.shippingFallbackRate ?? 80;
    const codFee = settingsMap.codFee ?? 0;

    const isCOD = paymentMethod === 'cod' ? 1 : 0;
    const packageWeight = parseFloat(weight) || parseFloat(process.env.SHIPROCKET_DEFAULT_WEIGHT) || 0.5;

    let shippingCost = fallbackRate; // Start with fallback
    let source = 'fallback';

    try {
      const srData = await shiprocket.checkServiceability(String(pincode), packageWeight, isCOD);
      const couriers = srData?.data?.available_courier_companies || [];

      if (couriers.length > 0) {
        // Sort by total charge ascending and pick the cheapest
        couriers.sort((a, b) => parseFloat(a.freight_charge) - parseFloat(b.freight_charge));
        shippingCost = parseFloat(couriers[0].freight_charge) || fallbackRate;
        source = 'shiprocket';
      }
    } catch (srError) {
      // Shiprocket failed — use fallback silently
      console.warn('[ShippingCalc] Shiprocket serviceability check failed, using fallback rate:', srError.message);
    }

    // Add COD fee on top if payment method is COD
    const totalShipping = shippingCost + (isCOD ? codFee : 0);

    return res.json({
      success: true,
      pincode,
      shippingCost: Math.round(totalShipping * 100) / 100,
      codFee: isCOD ? codFee : 0,
      source // 'shiprocket' or 'fallback'
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Push an order to Shiprocket (creates shipment on Shiprocket side)
// @route   POST /api/shiprocket/orders/:id/push
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
const pushOrderToShiprocket = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'firstName lastName email phone')
      .populate('items');

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (order.shiprocketOrderId) {
      return res.status(400).json({
        success: false,
        error: `Order has already been pushed to Shiprocket (SR Order ID: ${order.shiprocketOrderId})`
      });
    }

    // Create the order on Shiprocket
    const srResponse = await shiprocket.createShiprocketOrder(order, order.items);

    // Persist Shiprocket IDs back to the local order
    order.shiprocketOrderId = srResponse.order_id;
    order.shiprocketShipmentId = srResponse.shipment_id;
    order.shiprocketStatus = 'NEW';
    await order.save();

    await AdminLog.create({
      adminId: req.admin.id,
      action: `Pushed order #${order.orderNumber} to Shiprocket (SR ID: ${srResponse.order_id})`,
      entityType: 'order',
      entityId: order.id,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Order successfully pushed to Shiprocket!',
      shiprocketOrderId: srResponse.order_id,
      shiprocketShipmentId: srResponse.shipment_id,
      shiprocketStatus: srResponse.status
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Assign courier & generate AWB for a Shiprocket shipment
// @route   POST /api/shiprocket/orders/:id/assign-courier
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
const assignCourier = async (req, res, next) => {
  try {
    const { courierId } = req.body; // optional; Shiprocket auto-picks if omitted

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (!order.shiprocketShipmentId) {
      return res.status(400).json({
        success: false,
        error: 'Order has not been pushed to Shiprocket yet. Push it first.'
      });
    }

    if (order.shiprocketAWB) {
      return res.status(400).json({
        success: false,
        error: `Courier already assigned. AWB: ${order.shiprocketAWB}`
      });
    }

    const srResponse = await shiprocket.assignCourierAndGenerateAWB(
      order.shiprocketShipmentId,
      courierId || null
    );

    // Log the full response for debugging
    console.log('[assignCourier] Full SR response:', JSON.stringify(srResponse, null, 2));

    // Shiprocket has multiple possible response structures — try all known paths
    const awbCode =
      srResponse?.response?.data?.awb_code ||
      srResponse?.awb_code ||
      srResponse?.data?.awb_code ||
      srResponse?.response?.awb_code ||
      null;

    const courierName =
      srResponse?.response?.data?.courier_name ||
      srResponse?.courier_name ||
      srResponse?.data?.courier_name ||
      srResponse?.response?.courier_name ||
      '';

    console.log(`[assignCourier] Extracted AWB: ${awbCode}, Courier: ${courierName}`);

    // Even if AWB is null, Shiprocket accepted the request — log what we got
    if (!awbCode) {
      // Extract the actual reason from Shiprocket's response
      const srError =
        srResponse?.response?.data?.awb_assign_error ||
        srResponse?.message ||
        'No AWB returned. Check backend logs.';

      console.warn('[assignCourier] ⚠️  AWB is null. Full Shiprocket response was:', JSON.stringify(srResponse, null, 2));
      return res.status(422).json({
        success: false,
        error: `Shiprocket: ${srError}`,
        rawResponse: srResponse
      });
    }

    // Save AWB and tracking number back to the order
    order.shiprocketAWB = awbCode;
    order.shiprocketCourierName = courierName;
    order.shiprocketStatus = 'READY_TO_SHIP';
    order.trackingNumber = awbCode;
    await order.save();

    await AdminLog.create({
      adminId: req.admin.id,
      action: `Assigned courier for #${order.orderNumber} — AWB: ${awbCode} via ${courierName}`,
      entityType: 'order',
      entityId: order.id,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Courier assigned and AWB generated successfully!',
      awbCode,
      courierName,
      shiprocketStatus: order.shiprocketStatus
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Schedule a pickup for the Shiprocket shipment
// @route   POST /api/shiprocket/orders/:id/schedule-pickup
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
const schedulePickup = async (req, res, next) => {
  try {
    const { pickupDate } = req.body; // YYYY-MM-DD

    if (!pickupDate) {
      return res.status(400).json({ success: false, error: 'pickupDate is required (YYYY-MM-DD format).' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (!order.shiprocketShipmentId) {
      return res.status(400).json({
        success: false,
        error: 'Order has not been pushed to Shiprocket yet.'
      });
    }

    const srResponse = await shiprocket.schedulePickup(order.shiprocketShipmentId, pickupDate);

    order.shiprocketPickupDate = pickupDate;
    order.shiprocketStatus = 'PICKUP_SCHEDULED';
    await order.save();

    await AdminLog.create({
      adminId: req.admin.id,
      action: `Scheduled Shiprocket pickup for #${order.orderNumber} on ${pickupDate}`,
      entityType: 'order',
      entityId: order.id,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: `Pickup scheduled for ${pickupDate}`,
      data: srResponse
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Generate shipping label (returns PDF URL)
// @route   POST /api/shiprocket/orders/:id/generate-label
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
const generateLabel = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (!order.shiprocketShipmentId) {
      return res.status(400).json({
        success: false,
        error: 'Order has not been pushed to Shiprocket yet.'
      });
    }

    const srResponse = await shiprocket.generateShippingLabel(order.shiprocketShipmentId);

    const labelUrl = srResponse?.label_url || srResponse?.response?.label_url || null;

    if (labelUrl) {
      order.shiprocketLabelUrl = labelUrl;
      await order.save();
    }

    res.json({
      success: true,
      message: 'Shipping label generated successfully!',
      labelUrl,
      data: srResponse
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Generate manifest for a shipment
// @route   POST /api/shiprocket/orders/:id/generate-manifest
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
const generateManifest = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (!order.shiprocketShipmentId) {
      return res.status(400).json({
        success: false,
        error: 'Order has not been pushed to Shiprocket yet.'
      });
    }

    const srResponse = await shiprocket.generateManifest(order.shiprocketShipmentId);

    res.json({
      success: true,
      message: 'Manifest generated successfully!',
      manifestUrl: srResponse?.manifest_url || null,
      data: srResponse
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Track shipment live via AWB
// @route   GET /api/shiprocket/orders/:id/track
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
const trackShipment = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (!order.shiprocketAWB) {
      return res.status(400).json({
        success: false,
        error: 'No AWB number found. Assign a courier first.'
      });
    }

    const trackingData = await shiprocket.trackShipmentByAWB(order.shiprocketAWB);

    res.json({
      success: true,
      awb: order.shiprocketAWB,
      courier: order.shiprocketCourierName,
      tracking: trackingData
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Cancel a Shiprocket order
// @route   POST /api/shiprocket/orders/:id/cancel
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
const cancelShiprocketOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (!order.shiprocketOrderId) {
      return res.status(400).json({
        success: false,
        error: 'Order has not been pushed to Shiprocket yet.'
      });
    }

    const srResponse = await shiprocket.cancelShiprocketOrder(order.shiprocketOrderId);

    order.shiprocketStatus = 'CANCELLED';
    await order.save();

    await AdminLog.create({
      adminId: req.admin.id,
      action: `Cancelled Shiprocket shipment for order #${order.orderNumber}`,
      entityType: 'order',
      entityId: order.id,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Shiprocket order cancelled successfully.',
      data: srResponse
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Check courier serviceability for an order's delivery pincode
// @route   GET /api/shiprocket/orders/:id/serviceability
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
const checkOrderServiceability = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const shippingAddr =
      typeof order.shippingAddress === 'string'
        ? JSON.parse(order.shippingAddress)
        : order.shippingAddress;

    const pincode = shippingAddr?.zip;
    if (!pincode) {
      return res.status(400).json({
        success: false,
        error: 'Shipping pincode not found in order address.'
      });
    }

    const isCOD = order.paymentMethod === 'cod' ? 1 : 0;
    const weight = parseFloat(req.query.weight || process.env.SHIPROCKET_DEFAULT_WEIGHT || 0.5);

    const serviceabilityData = await shiprocket.checkServiceability(pincode, weight, isCOD);

    res.json({
      success: true,
      pincode,
      weight,
      isCOD,
      data: serviceabilityData
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get all available pickup addresses from Shiprocket account
// @route   GET /api/shiprocket/pickup-addresses
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
const getPickupAddresses = async (req, res, next) => {
  try {
    const data = await shiprocket.getPickupAddresses();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Webhook handler — Shiprocket posts shipment status updates here
// @route   POST /api/shiprocket/webhook
// @access  Public (verified by x-api-key header)
// ─────────────────────────────────────────────────────────────────────────────
const handleWebhook = async (req, res, next) => {
  try {
    // Verify webhook security token if configured
    const webhookSecret = process.env.SHIPROCKET_WEBHOOK_SECRET;
    if (webhookSecret) {
      const receivedKey = req.headers['x-api-key'];
      if (receivedKey !== webhookSecret) {
        console.warn('[Shiprocket Webhook] ⚠️  Unauthorized webhook attempt blocked.');
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
    }

    const payload = req.body;

    console.log('[Shiprocket Webhook] 📦 Received payload:', JSON.stringify(payload, null, 2));

    const {
      awb,
      courier_name,
      current_status,
      current_status_id,
      shipment_status,
      shipment_status_id,
      order_id: srOrderId,
      sr_order_id
    } = payload;

    if (!awb && !srOrderId) {
      return res.status(200).json({ success: true, message: 'No actionable data.' });
    }

    // Try to find the local order by AWB or Shiprocket order ID
    const query = awb
      ? { $or: [{ shiprocketAWB: awb }, { trackingNumber: awb }] }
      : { shiprocketOrderId: sr_order_id || srOrderId };

    const order = await Order.findOne(query);

    if (!order) {
      console.warn(`[Shiprocket Webhook] ⚠️  No matching order found for AWB: ${awb} / SR Order: ${sr_order_id}`);
      // Always respond 200 to Shiprocket so they stop retrying
      return res.status(200).json({ success: true, message: 'Order not found locally.' });
    }

    // ── Map Shiprocket status to local order status ──────────────────────────
    // Shiprocket status IDs reference: https://apidocs.shiprocket.in/
    const statusMap = {
      1: 'pending',          // Pending
      2: 'processing',       // Information Received
      3: 'processing',       // Pickup Scheduled
      4: 'processing',       // Pickup Generated
      5: 'processing',       // Manifest Generated
      6: 'shipped',          // Shipped
      7: 'shipped',          // Out For Delivery
      8: 'delivered',        // Delivered
      9: 'cancelled',        // Cancelled
      10: 'returned',        // RTO Initiated
      11: 'returned',        // RTO Delivered
      12: 'returned',        // Lost
      13: 'shipped',         // Pickup Error
      14: 'shipped',         // Pickup Rescheduled
      15: 'processing',      // Self Fulfilment
      16: 'processing',      // Out For Pickup
      17: 'shipped',         // In Transit
      18: 'shipped',         // In Transit (Alternate)
      19: 'shipped',         // Misrouted
      20: 'shipped',         // In Transit (Another)
      42: 'shipped',         // Picked Up
      43: 'delivered'        // Delivered (Alternate)
    };

    const newOrderStatus = statusMap[shipment_status_id] || order.orderStatus;
    const oldStatus = order.orderStatus;

    // Update Shiprocket-specific fields
    order.shiprocketStatus = current_status || shipment_status || order.shiprocketStatus;
    order.shiprocketStatusId = current_status_id || shipment_status_id;
    if (awb) order.shiprocketAWB = awb;
    if (courier_name) order.shiprocketCourierName = courier_name;

    // Sync main order status
    if (newOrderStatus !== oldStatus) {
      order.orderStatus = newOrderStatus;

      // Auto-sync shipping and payment statuses
      if (newOrderStatus === 'delivered') {
        order.shippingStatus = 'delivered';
        if (order.paymentMethod === 'cod') {
          order.paymentStatus = 'paid'; // COD collected on delivery
        }
      } else if (newOrderStatus === 'shipped') {
        order.shippingStatus = 'shipped';
      }

      console.log(
        `[Shiprocket Webhook] 🔄 Order #${order.orderNumber}: ${oldStatus} → ${newOrderStatus} (SR Status: ${current_status})`
      );
    }

    await order.save();

    // Always return 200 to Shiprocket
    return res.status(200).json({ success: true, message: 'Webhook processed.' });
  } catch (error) {
    console.error('[Shiprocket Webhook] ❌ Error processing webhook:', error.message);
    // Still return 200 to avoid Shiprocket retries flooding
    return res.status(200).json({ success: true, message: 'Webhook received with internal error.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get Shiprocket status/details for a single order
// @route   GET /api/shiprocket/orders/:id/status
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
const getShiprocketOrderStatus = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    res.json({
      success: true,
      shiprocket: {
        orderId: order.shiprocketOrderId || null,
        shipmentId: order.shiprocketShipmentId || null,
        awb: order.shiprocketAWB || null,
        courierName: order.shiprocketCourierName || null,
        status: order.shiprocketStatus || null,
        statusId: order.shiprocketStatusId || null,
        labelUrl: order.shiprocketLabelUrl || null,
        pickupDate: order.shiprocketPickupDate || null,
        isPushed: !!order.shiprocketOrderId
      }
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Test Shiprocket API Connection with current credentials
// @route   GET /api/shipping/test-connection
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
const testShiprocketConnection = async (req, res, next) => {
  try {
    // Clear any cached token or error cool-off before testing
    if (shiprocket.clearShiprocketTokenCache) {
      shiprocket.clearShiprocketTokenCache();
    }
    const token = await shiprocket.getShiprocketToken();
    const config = await shiprocket.getShiprocketConfig();

    res.json({
      success: true,
      message: 'Shiprocket authentication successful! Credentials are valid.',
      email: config.email,
      pickupLocation: config.pickupLocation
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  calculateShippingRate,
  pushOrderToShiprocket,
  assignCourier,
  schedulePickup,
  generateLabel,
  generateManifest,
  trackShipment,
  cancelShiprocketOrder,
  checkOrderServiceability,
  getPickupAddresses,
  handleWebhook,
  getShiprocketOrderStatus,
  testShiprocketConnection
};
