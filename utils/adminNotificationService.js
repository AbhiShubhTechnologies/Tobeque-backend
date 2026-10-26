/**
 * utils/adminNotificationService.js
 * Real-time notification broadcaster and order event handler for Admin Panel.
 * Uses Server-Sent Events (SSE) with auto-reconnection and zero third-party dependencies.
 */

const { AdminNotification } = require('../models');

// Set to hold all active admin SSE client response streams
const sseClients = new Set();

/**
 * Handle new SSE connection from an authenticated admin
 */
const registerSseClient = (req, res) => {
  // Set headers for persistent Server-Sent Events stream
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Prevents Nginx/proxy buffering
  });

  // Immediately acknowledge connection
  res.write(`data: ${JSON.stringify({ event: 'connected', message: 'Admin notifications live stream connected' })}\n\n`);

  // Add client to active pool
  sseClients.add(res);

  // Keep-alive heartbeat every 25 seconds to prevent browser/proxy connection timeout
  const heartbeat = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (err) {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 25000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
};

/**
 * Broadcast an event payload to all connected admin SSE clients
 * @param {Object} data 
 */
const broadcastToAdmins = (data) => {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (err) {
      sseClients.delete(client);
    }
  }
};

/**
 * Automatically create and broadcast an Admin Notification when a new order is placed
 * @param {Object} order - Created order document
 * @param {Object} user - User document or auth payload (optional)
 * @returns {Promise<Object|null>}
 */
const notifyAdminNewOrder = async (order, user = null) => {
  try {
    if (!order || (!order._id && !order.orderNumber)) {
      return null;
    }

    // ── Prevent Duplicate Notifications for the same order ───────────────────
    const query = [];
    if (order._id) query.push({ orderId: order._id });
    if (order.orderNumber) query.push({ orderNumber: order.orderNumber });

    if (query.length > 0) {
      const existing = await AdminNotification.findOne({ $or: query });
      if (existing) {
        return existing;
      }
    }

    // ── Determine Customer Name ──────────────────────────────────────────────
    let customerName = '';
    if (user) {
      customerName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.phone || user.email || '';
    }

    if (!customerName && order.shippingAddress) {
      try {
        const addr = typeof order.shippingAddress === 'string'
          ? JSON.parse(order.shippingAddress)
          : order.shippingAddress;
        if (addr && addr.name) {
          customerName = addr.name.trim();
        }
      } catch (e) {
        // Fallback
      }
    }

    if (!customerName && order.user) {
      if (typeof order.user === 'object') {
        customerName = `${order.user.firstName || ''} ${order.user.lastName || ''}`.trim() || order.user.email || '';
      }
    }

    if (!customerName) {
      customerName = 'Customer';
    }

    const formattedAmount = Number(order.totalAmount || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 2
    });

    const message = `Order #${order.orderNumber} placed by ${customerName} for ₹${formattedAmount}`;

    // Create the persistent notification record in database
    const notification = await AdminNotification.create({
      title: 'New Order Received',
      message,
      type: 'order',
      orderId: order._id,
      orderNumber: order.orderNumber,
      customerName,
      amount: order.totalAmount || 0,
      isRead: false,
      metadata: {
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        itemCount: order.items?.length || 0,
        shippingStatus: order.shippingStatus || 'pending'
      }
    });

    // Compute fresh unread count
    const unreadCount = await AdminNotification.countDocuments({ isRead: false });

    // Broadcast in real-time to all connected admin panels
    broadcastToAdmins({
      event: 'new_order_notification',
      notification,
      unreadCount
    });

    console.log(`[Notification] Real-time alert dispatched for Order #${order.orderNumber} (${sseClients.size} admins connected)`);
    return notification;
  } catch (error) {
    console.error('[Notification] Error creating admin order notification:', error);
    return null;
  }
};

module.exports = {
  registerSseClient,
  broadcastToAdmins,
  notifyAdminNewOrder
};
