const { Order, OrderItem, User, Product, Payment, InventoryLog, AdminLog } = require('../models');
const { sendOrderConfirmationEmail } = require('../utils/emailService');

// @desc    Get List of Orders
// @route   GET /api/orders
// @access  Private
const getOrders = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status,
      paymentStatus,
      sortBy = 'createdAt',
      sortDir = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    const where = {};

    if (status) {
      where.orderStatus = status;
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      where.$or = [
        { orderNumber: searchRegex },
        { trackingNumber: searchRegex }
      ];
    }

    const count = await Order.countDocuments(where);
    const rows = await Order.find(where)
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .sort({ [sortBy]: sortDir.toUpperCase() === 'DESC' ? -1 : 1 })
      .populate('user', 'firstName lastName email');

    res.json({
      success: true,
      data: {
        orders: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Order Detail By ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'firstName lastName email phone')
      .populate({
        path: 'items',
        populate: { path: 'product', select: 'thumbnail' }
      })
      .populate('payments');

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    res.json({
      success: true,
      order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update Order Status & Inventory Restock Logic
// @route   PUT /api/orders/:id/status
// @access  Private
const updateOrderStatus = async (req, res, next) => {
  try {
    const { orderStatus, paymentStatus, shippingStatus, trackingNumber, adminNotes } = req.body;
    const order = await Order.findById(req.params.id).populate('items');

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const oldOrderStatus = order.orderStatus;
    const newOrderStatus = orderStatus || oldOrderStatus;

    // Determine if inventory needs restocking (if status switches to cancelled or returned from an active status)
    const isNowCancelledOrReturned = ['cancelled', 'returned'].includes(newOrderStatus);
    const wasActiveStatus = !['cancelled', 'returned'].includes(oldOrderStatus);

    if (isNowCancelledOrReturned && wasActiveStatus) {
      console.log(`Order ${order.orderNumber} status changed from ${oldOrderStatus} to ${newOrderStatus}. Restocking items...`);
      for (const item of order.items) {
        if (item.product) {
          const product = await Product.findById(item.product);
          if (product) {
            product.stockQuantity += item.quantity;
            await product.save();

            // Log stock restock action
            await InventoryLog.create({
              productId: product.id,
              stockChanged: item.quantity,
              actionType: newOrderStatus === 'cancelled' ? 'correction' : 'return',
              reference: `Restock due to Order #${order.orderNumber} ${newOrderStatus}`,
              adminId: req.admin.id
            });
          }
        }
      }
    }

    // Determine if inventory needs deducting (if status switches BACK from cancelled/returned to active)
    const isNowActive = !['cancelled', 'returned'].includes(newOrderStatus);
    const wasCancelledOrReturned = ['cancelled', 'returned'].includes(oldOrderStatus);

    if (isNowActive && wasCancelledOrReturned) {
      console.log(`Order ${order.orderNumber} status reactivated from ${oldOrderStatus} to ${newOrderStatus}. Deducting items...`);
      for (const item of order.items) {
        if (item.product) {
          const product = await Product.findById(item.product);
          if (product) {
            product.stockQuantity = Math.max(0, product.stockQuantity - item.quantity);
            await product.save();

            await InventoryLog.create({
              productId: product.id,
              stockChanged: -item.quantity,
              actionType: 'sale',
              reference: `Deduct due to Order #${order.orderNumber} reactivation`,
              adminId: req.admin.id
            });
          }
        }
      }
    }

    // Update order details
    order.orderStatus = newOrderStatus;
    order.paymentStatus = paymentStatus || order.paymentStatus;
    order.shippingStatus = shippingStatus || order.shippingStatus;
    order.trackingNumber = trackingNumber !== undefined ? trackingNumber : order.trackingNumber;
    order.adminNotes = adminNotes !== undefined ? adminNotes : order.adminNotes;

    // Automatically synchronize shipping status depending on order status
    if (order.orderStatus === 'delivered') {
      order.shippingStatus = 'delivered';
      order.paymentStatus = 'paid'; // COD orders marked as delivered are paid
    } else if (order.orderStatus === 'shipped') {
      order.shippingStatus = 'shipped';
    }

    await order.save();

    await AdminLog.create({
      adminId: req.admin.id,
      action: `Updated order status for #${order.orderNumber} to ${order.orderStatus}`,
      entityType: 'order',
      entityId: order.id,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Order updated successfully',
      order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Fetch Printable Invoice Details
// @route   GET /api/orders/:id/invoice
// @access  Private
const getInvoiceDetails = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'firstName lastName email phone')
      .populate('items');

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    res.json({
      success: true,
      invoice: {
        orderNumber: order.orderNumber,
        date: order.createdAt,
        billingAddress: order.billingAddress,
        shippingAddress: order.shippingAddress,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        subtotal: order.subtotal,
        taxAmount: order.taxAmount,
        shippingCost: order.shippingCost,
        discountAmount: order.discountAmount,
        totalAmount: order.totalAmount,
        customer: order.user,
        items: order.items
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete Order
// @route   DELETE /api/orders/:id
// @access  Private
const deleteOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // Delete associated OrderItems and Payments
    await OrderItem.deleteMany({ order: order._id });
    await Payment.deleteMany({ order: order._id });

    // Finally delete the order
    await Order.findByIdAndDelete(req.params.id);

    await AdminLog.create({
      adminId: req.admin.id,
      action: `Deleted order #${order.orderNumber}`,
      entityType: 'order',
      entityId: req.params.id,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Order deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Explicitly confirm order and send invoice email
// @route   POST /api/orders/:id/confirm
// @access  Private (Admin)
const confirmOrder = async (req, res, next) => {
  try {
    const { sendEmail = true } = req.body;
    const order = await Order.findById(req.params.id).populate('items');

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    order.orderStatus = 'confirmed';
    await order.save();

    let emailResult = { success: false, reason: 'Email notification disabled' };
    if (sendEmail) {
      const emailUser = await User.findById(order.user).select('firstName lastName email phone');
      const items = await OrderItem.find({ order: order._id });
      emailResult = await sendOrderConfirmationEmail(
        order.toJSON(),
        emailUser,
        items.map(i => i.toJSON())
      );
    }

    await AdminLog.create({
      adminId: req.admin.id,
      action: `Confirmed order #${order.orderNumber}${sendEmail ? ' and sent tax invoice email' : ''}`,
      entityType: 'order',
      entityId: order.id,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: emailResult.success
        ? `Order #${order.orderNumber} confirmed and tax invoice emailed successfully!`
        : `Order #${order.orderNumber} confirmed successfully.`,
      emailSent: emailResult.success,
      order
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrders,
  getOrderById,
  updateOrderStatus,
  confirmOrder,
  getInvoiceDetails,
  deleteOrder
};
