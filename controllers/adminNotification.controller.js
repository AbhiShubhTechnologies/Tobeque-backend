/**
 * controllers/adminNotification.controller.js
 * Controller handling in-app admin notifications, read state persistence, and SSE streaming.
 */

const { AdminNotification, Order } = require('../models');
const { registerSseClient, broadcastToAdmins } = require('../utils/adminNotificationService');

/**
 * @desc    Get paginated admin notifications
 * @route   GET /api/admin-notifications
 * @access  Private (Admin)
 */
const getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;

    const query = {};
    if (unreadOnly === 'true' || unreadOnly === true) {
      query.isRead = false;
    }

    const unreadCount = await AdminNotification.countDocuments({ isRead: false });
    const total = await AdminNotification.countDocuments(query);

    const notifications = await AdminNotification.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    // Optional initial seed: If no notifications exist yet but orders do, backfill the 5 latest orders
    if (total === 0 && !query.isRead) {
      const recentOrders = await Order.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'firstName lastName email phone');

      if (recentOrders.length > 0) {
        for (const ord of recentOrders) {
          let customerName = 'Customer';
          if (ord.user) {
            customerName = `${ord.user.firstName || ''} ${ord.user.lastName || ''}`.trim() || ord.user.email || 'Customer';
          }
          const formattedAmount = Number(ord.totalAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
          await AdminNotification.create({
            title: 'New Order Received',
            message: `Order #${ord.orderNumber} placed by ${customerName} for ₹${formattedAmount}`,
            type: 'order',
            orderId: ord._id,
            orderNumber: ord.orderNumber,
            customerName,
            amount: ord.totalAmount || 0,
            isRead: false,
            createdAt: ord.createdAt
          });
        }

        const seeded = await AdminNotification.find({})
          .sort({ createdAt: -1 })
          .limit(parseInt(limit));
        const seededUnread = await AdminNotification.countDocuments({ isRead: false });

        return res.json({
          success: true,
          data: {
            notifications: seeded,
            unreadCount: seededUnread,
            pagination: {
              total: seeded.length,
              page: 1,
              limit: parseInt(limit),
              pages: 1
            }
          }
        });
      }
    }

    res.json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current unread notification count
 * @route   GET /api/admin-notifications/unread-count
 * @access  Private (Admin)
 */
const getUnreadCount = async (req, res, next) => {
  try {
    const unreadCount = await AdminNotification.countDocuments({ isRead: false });
    res.json({
      success: true,
      unreadCount
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark a single notification as read
 * @route   PATCH /api/admin-notifications/:id/read
 * @access  Private (Admin)
 */
const markAsRead = async (req, res, next) => {
  try {
    const notification = await AdminNotification.findByIdAndUpdate(
      req.params.id,
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    const unreadCount = await AdminNotification.countDocuments({ isRead: false });

    // Inform other admin tabs/sessions
    broadcastToAdmins({
      event: 'read_status_changed',
      notificationId: notification._id,
      isRead: true,
      unreadCount
    });

    res.json({
      success: true,
      notification,
      unreadCount
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark all unread notifications as read
 * @route   PATCH /api/admin-notifications/read-all
 * @access  Private (Admin)
 */
const markAllAsRead = async (req, res, next) => {
  try {
    await AdminNotification.updateMany(
      { isRead: false },
      { isRead: true, readAt: new Date() }
    );

    // Broadcast update
    broadcastToAdmins({
      event: 'all_read',
      unreadCount: 0
    });

    res.json({
      success: true,
      message: 'All notifications marked as read',
      unreadCount: 0
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a notification
 * @route   DELETE /api/admin-notifications/:id
 * @access  Private (Admin)
 */
const deleteNotification = async (req, res, next) => {
  try {
    const notification = await AdminNotification.findByIdAndDelete(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    const unreadCount = await AdminNotification.countDocuments({ isRead: false });

    res.json({
      success: true,
      message: 'Notification deleted',
      unreadCount
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Establish real-time SSE stream connection
 * @route   GET /api/admin-notifications/stream
 * @access  Private (Admin)
 */
const streamNotifications = (req, res) => {
  registerSseClient(req, res);
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  streamNotifications
};
