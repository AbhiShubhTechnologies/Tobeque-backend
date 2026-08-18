/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Shiprocket API Service Utility
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles:
 *   - Token generation & automatic refresh (tokens expire in 24h)
 *   - Order creation on Shiprocket
 *   - Courier serviceability check
 *   - Assign courier & generate AWB
 *   - Schedule pickup
 *   - Generate shipping label URL
 *   - Track shipment
 *   - Cancel shipment
 *   - Rate calculator
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT: Add your credentials to .env before using:
 *   SHIPROCKET_EMAIL=your_api_user_email@example.com
 *   SHIPROCKET_PASSWORD=your_api_user_password
 *   SHIPROCKET_PICKUP_PINCODE=380015
 * ─────────────────────────────────────────────────────────────────────────────
 */

const axios = require('axios');

const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

// ─── In-memory token cache ────────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiresAt = null; // UTC ms timestamp

/**
 * Authenticate with Shiprocket and return a bearer token.
 * Tokens are cached in memory and automatically refreshed when expired.
 */
const getShiprocketToken = async () => {
  // Return cached token if still valid (leaving 5 min buffer before expiry)
  if (cachedToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Shiprocket credentials are missing. Please set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in your .env file.'
    );
  }

  try {
    const response = await axios.post(`${SHIPROCKET_BASE_URL}/auth/login`, {
      email,
      password
    });

    const { token } = response.data;

    if (!token) {
      throw new Error('Shiprocket authentication failed: No token received.');
    }

    cachedToken = token;
    // Shiprocket tokens expire in 24 hours
    tokenExpiresAt = Date.now() + 24 * 60 * 60 * 1000;

    console.log('[Shiprocket] ✅ Token refreshed successfully.');
    return token;
  } catch (error) {
    cachedToken = null;
    tokenExpiresAt = null;
    const msg = error.response?.data?.message || error.message;
    console.error('[Shiprocket] ❌ Token generation failed:', msg);
    throw new Error(`Shiprocket authentication error: ${msg}`);
  }
};

/**
 * Returns a pre-configured Axios instance with the Shiprocket bearer token.
 */
const getShiprocketClient = async () => {
  const token = await getShiprocketToken();
  return axios.create({
    baseURL: SHIPROCKET_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    timeout: 30000
  });
};

// ─── Order Management ─────────────────────────────────────────────────────────

/**
 * Create a new order on Shiprocket from a local Order document.
 * @param {Object} order - Populated Order mongoose document
 * @param {Array}  items - Array of populated OrderItem documents
 * @returns {Object} Shiprocket API response data
 */
const createShiprocketOrder = async (order, items) => {
  const client = await getShiprocketClient();

  const shippingAddr =
    typeof order.shippingAddress === 'string'
      ? JSON.parse(order.shippingAddress)
      : order.shippingAddress;

  const billingAddr =
    typeof order.billingAddress === 'string'
      ? JSON.parse(order.billingAddress)
      : order.billingAddress || shippingAddr;

  // Map local order items to Shiprocket's expected format
  const orderItems = items.map((item) => ({
    name: item.productName,
    sku: item.sku,
    units: item.quantity,
    selling_price: parseFloat(item.price).toFixed(2),
    discount: '0',
    tax: parseFloat(item.taxRate || 0).toFixed(2),
    hsn: '' // HSN code (can be added to Product model later)
  }));

  const isCOD = order.paymentMethod === 'cod' ? 1 : 0;

  // Sanitize phone: strip country code prefix and non-digit chars, keep last 10 digits
  const sanitizePhone = (phone) => {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  };

  const billingPhone = sanitizePhone(billingAddr?.phone || shippingAddr?.phone || order.user?.phone);
  const shippingPhone = sanitizePhone(shippingAddr?.phone || order.user?.phone);

  const payload = {
    order_id: order.orderNumber,
    order_date: new Date(order.createdAt).toISOString().split('T')[0],
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary',

    // Billing Details
    billing_customer_name: billingAddr?.name || shippingAddr?.name || 'Customer',
    billing_last_name: '',
    billing_address: billingAddr?.street || shippingAddr?.street || '',
    billing_address_2: billingAddr?.address2 || '',
    billing_city: billingAddr?.city || shippingAddr?.city || '',
    billing_pincode: billingAddr?.zip || shippingAddr?.zip || '',
    billing_state: billingAddr?.state || shippingAddr?.state || '',
    billing_country: billingAddr?.country || shippingAddr?.country || 'India',
    billing_email: order.user?.email || '',
    billing_phone: billingPhone,
    billing_alternate_phone: '',

    // Shipping Details (same as billing if not different)
    shipping_is_billing: false,
    shipping_customer_name: shippingAddr?.name || 'Customer',
    shipping_last_name: '',
    shipping_address: shippingAddr?.street || '',
    shipping_address_2: shippingAddr?.address2 || '',
    shipping_city: shippingAddr?.city || '',
    shipping_pincode: shippingAddr?.zip || '',
    shipping_country: shippingAddr?.country || 'India',
    shipping_state: shippingAddr?.state || '',
    shipping_email: order.user?.email || '',
    shipping_phone: shippingPhone,

    // Order Items
    order_items: orderItems,

    // Payment & Amounts
    payment_method: isCOD ? 'COD' : 'Prepaid',
    shipping_charges: parseFloat(order.shippingCost || 0).toFixed(2),
    giftwrap_charges: 0,
    transaction_charges: 0,
    total_discount: parseFloat(order.discountAmount || 0).toFixed(2),
    sub_total: parseFloat(order.subtotal).toFixed(2),
    length: parseFloat(process.env.SHIPROCKET_DEFAULT_LENGTH || 15),
    breadth: parseFloat(process.env.SHIPROCKET_DEFAULT_BREADTH || 12),
    height: parseFloat(process.env.SHIPROCKET_DEFAULT_HEIGHT || 10),
    weight: parseFloat(process.env.SHIPROCKET_DEFAULT_WEIGHT || 0.5)
  };

  try {
    const response = await client.post('/orders/create/adhoc', payload);
    console.log(`[Shiprocket] ✅ Order created for #${order.orderNumber}:`, response.data.order_id);
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    console.error(`[Shiprocket] ❌ Failed to create order for #${order.orderNumber}:`, msg);
    throw new Error(`Shiprocket order creation failed: ${msg}`);
  }
};

/**
 * Check courier serviceability and get shipping rates.
 * @param {string} deliveryPincode - Customer delivery pincode
 * @param {number} weight - Package weight in kg
 * @param {number} cod - 1 for COD, 0 for Prepaid
 * @returns {Object} Shiprocket serviceability response
 */
const checkServiceability = async (deliveryPincode, weight = 0.5, cod = 0) => {
  const client = await getShiprocketClient();
  const pickupPincode = process.env.SHIPROCKET_PICKUP_PINCODE || '380015';

  try {
    const response = await client.get('/courier/serviceability/', {
      params: {
        pickup_postcode: pickupPincode,
        delivery_postcode: deliveryPincode,
        weight,
        cod
      }
    });
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    throw new Error(`Shiprocket serviceability check failed: ${msg}`);
  }
};

/**
 * Assign the best/recommended courier to a Shiprocket shipment
 * and generate an AWB (Air Waybill) tracking number.
 * @param {number} shipmentId - Shiprocket shipment_id from order creation
 * @param {number} courierId  - Shiprocket courier_company_id (optional, auto-selects if omitted)
 * @returns {Object} AWB assignment response
 */
const assignCourierAndGenerateAWB = async (shipmentId, courierId = null) => {
  const client = await getShiprocketClient();

  const payload = { shipment_id: shipmentId }; // NOTE: Shiprocket expects a single number, NOT an array
  if (courierId) {
    payload.courier_id = courierId;
  }

  try {
    const response = await client.post('/courier/assign/awb', payload);

    // Log the full raw response so we can see what Shiprocket actually returned
    console.log('[Shiprocket] AWB raw response:', JSON.stringify(response.data, null, 2));

    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    // Log the full error body too
    console.error('[Shiprocket] ❌ AWB assignment error body:', JSON.stringify(error.response?.data, null, 2));
    throw new Error(`Shiprocket AWB assignment failed: ${msg}`);
  }
};

/**
 * Schedule a pickup for a shipment.
 * @param {Array}  shipmentIds  - Array of Shiprocket shipment IDs
 * @param {string} pickupDate   - Date string in YYYY-MM-DD format
 * @returns {Object} Pickup schedule response
 */
const schedulePickup = async (shipmentIds, pickupDate) => {
  const client = await getShiprocketClient();

  try {
    const response = await client.post('/courier/generate/pickup', {
      shipment_id: Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds],
      pickup_date: pickupDate
    });
    console.log(`[Shiprocket] ✅ Pickup scheduled for shipments:`, shipmentIds);
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    throw new Error(`Shiprocket pickup scheduling failed: ${msg}`);
  }
};

/**
 * Generate and fetch the shipping label PDF URL.
 * @param {Array|number} shipmentIds - Shiprocket shipment ID(s)
 * @returns {Object} Label URL response
 */
const generateShippingLabel = async (shipmentIds) => {
  const client = await getShiprocketClient();
  const ids = Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds];

  try {
    const response = await client.post('/courier/generate/label', {
      shipment_id: ids
    });
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    throw new Error(`Shiprocket label generation failed: ${msg}`);
  }
};

/**
 * Track a shipment by its AWB number.
 * @param {string} awbCode - AWB tracking number
 * @returns {Object} Tracking data
 */
const trackShipmentByAWB = async (awbCode) => {
  const client = await getShiprocketClient();

  try {
    const response = await client.get(`/courier/track/awb/${awbCode}`);
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    throw new Error(`Shiprocket tracking failed: ${msg}`);
  }
};

/**
 * Track a shipment by Shiprocket order ID.
 * @param {number} shiprocketOrderId
 * @returns {Object} Tracking data
 */
const trackShipmentByOrderId = async (shiprocketOrderId) => {
  const client = await getShiprocketClient();

  try {
    const response = await client.get(`/orders/show/${shiprocketOrderId}`);
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    throw new Error(`Shiprocket order tracking failed: ${msg}`);
  }
};

/**
 * Cancel a Shiprocket order.
 * @param {Array|number} orderIds - Shiprocket order IDs to cancel
 * @returns {Object} Cancellation response
 */
const cancelShiprocketOrder = async (orderIds) => {
  const client = await getShiprocketClient();
  const ids = Array.isArray(orderIds) ? orderIds : [orderIds];

  try {
    const response = await client.post('/orders/cancel', {
      ids
    });
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    throw new Error(`Shiprocket order cancellation failed: ${msg}`);
  }
};

/**
 * Get a list of all Shiprocket pickup addresses configured for the seller.
 * @returns {Object} List of pickup addresses
 */
const getPickupAddresses = async () => {
  const client = await getShiprocketClient();

  try {
    const response = await client.get('/settings/company/pickup');
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    throw new Error(`Shiprocket pickup addresses fetch failed: ${msg}`);
  }
};

/**
 * Generate manifest for one or more shipments.
 * @param {Array|number} shipmentIds
 * @returns {Object} Manifest response
 */
const generateManifest = async (shipmentIds) => {
  const client = await getShiprocketClient();
  const ids = Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds];

  try {
    const response = await client.post('/manifests/generate', {
      shipment_id: ids
    });
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    throw new Error(`Shiprocket manifest generation failed: ${msg}`);
  }
};

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  getShiprocketToken,
  createShiprocketOrder,
  checkServiceability,
  assignCourierAndGenerateAWB,
  schedulePickup,
  generateShippingLabel,
  trackShipmentByAWB,
  trackShipmentByOrderId,
  cancelShiprocketOrder,
  getPickupAddresses,
  generateManifest
};
