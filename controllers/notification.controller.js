/**
 * controllers/notification.controller.js
 * ─────────────────────────────────────────────────────────────
 * Handles all push notification operations:
 *  - sendNotification   : Compose & dispatch to FCM, save to DB
 *  - getNotifications   : Paginated history list
 *  - getNotificationById: Single notification detail
 *  - deleteNotification : Remove from history
 *
 * Auth is enforced at the route level (middlewares/auth.js protect)
 * ─────────────────────────────────────────────────────────────
 */

const Notification = require('../models/notification');
const User = require('../models/user');
const { getMessaging, isFirebaseReady } = require('../config/firebase');

// ─── Helper: Build FCM message object ────────────────────────────────────────

const buildFcmMessage = ({ title, subtitle, body, imageUrl, data }) => {
  const notification = {
    title,
    body: subtitle ? `${subtitle}\n${body}` : body
  };

  if (imageUrl) {
    notification.imageUrl = imageUrl;
  }

  // Data payload for Flutter app — all values must be strings
  const dataPayload = {
    title: title || '',
    subtitle: subtitle || '',
    body: body || '',
    imageUrl: imageUrl || '',
    clickAction: 'FLUTTER_NOTIFICATION_CLICK',
    ...Object.fromEntries(
      Object.entries(data || {}).map(([k, v]) => [k, String(v)])
    )
  };

  return { notification, dataPayload };
};

// ─── @route  POST /api/notifications/send ────────────────────────────────────

exports.sendNotification = async (req, res) => {
  try {
    const {
      title,
      subtitle = '',
      body,
      imageUrl = null,
      targetType = 'all',
      topic = null,
      targetUserId = null,
      data = {}
    } = req.body;

    // --- Validation ---
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({ success: false, message: 'Body/description is required' });
    }

    // --- Check Firebase is ready ---
    if (!isFirebaseReady()) {
      return res.status(503).json({
        success: false,
        message:
          'Firebase Admin SDK is not configured. Please add firebase-service-account.json to backend/config/ and restart the server.'
      });
    }

    const messaging = getMessaging();
    const { notification: fcmNotification, dataPayload } = buildFcmMessage({
      title,
      subtitle,
      body,
      imageUrl,
      data
    });

    let result = {};
    let status = 'sent';
    let successCount = 0;
    let failureCount = 0;
    let fcmMessageId = null;
    let errorMessage = null;
    let targetUserFcmToken = null;

    // ── Strategy: Broadcast to ALL users via topic ─────────────────────────
    if (targetType === 'all') {
      const message = {
        topic: 'all_users', // Users must subscribe to this topic on app start
        notification: fcmNotification,
        data: dataPayload,
        android: {
          priority: 'high',
          notification: {
            channelId: 'tobeque_notifications',
            priority: 'high',
            defaultVibrateTimings: true,
            ...(imageUrl && { imageUrl })
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              mutableContent: imageUrl ? 1 : 0 // Enable NSE for image
            }
          },
          ...(imageUrl && {
            fcmOptions: { imageUrl }
          })
        }
      };

      try {
        const sendResult = await messaging.send(message);
        fcmMessageId = sendResult;
        successCount = 1; // topic sends don't return individual counts
        status = 'sent';
      } catch (err) {
        status = 'failed';
        failureCount = 1;
        errorMessage = err.message;
      }
    }

    // ── Strategy: Send to a specific topic/segment ──────────────────────────
    else if (targetType === 'topic') {
      if (!topic) {
        return res.status(400).json({ success: false, message: 'Topic is required for topic targeting' });
      }

      const message = {
        topic,
        notification: fcmNotification,
        data: dataPayload,
        android: {
          priority: 'high',
          notification: {
            channelId: 'tobeque_notifications',
            ...(imageUrl && { imageUrl })
          }
        },
        apns: {
          payload: { aps: { sound: 'default', badge: 1 } },
          ...(imageUrl && { fcmOptions: { imageUrl } })
        }
      };

      try {
        const sendResult = await messaging.send(message);
        fcmMessageId = sendResult;
        successCount = 1;
        status = 'sent';
      } catch (err) {
        status = 'failed';
        failureCount = 1;
        errorMessage = err.message;
      }
    }

    // ── Strategy: Send to an individual user by FCM token ──────────────────
    else if (targetType === 'individual') {
      if (!targetUserId) {
        return res.status(400).json({
          success: false,
          message: 'targetUserId is required for individual targeting'
        });
      }

      const user = await User.findById(targetUserId).select('fcmToken firstName lastName');
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      if (!user.fcmToken) {
        return res.status(400).json({
          success: false,
          message: 'This user does not have a registered FCM token (app may not be installed or notifications disabled)'
        });
      }

      targetUserFcmToken = user.fcmToken;

      const message = {
        token: user.fcmToken,
        notification: fcmNotification,
        data: dataPayload,
        android: {
          priority: 'high',
          notification: {
            channelId: 'tobeque_notifications',
            ...(imageUrl && { imageUrl })
          }
        },
        apns: {
          payload: { aps: { sound: 'default', badge: 1 } },
          ...(imageUrl && { fcmOptions: { imageUrl } })
        }
      };

      try {
        const sendResult = await messaging.send(message);
        fcmMessageId = sendResult;
        successCount = 1;
        status = 'sent';
      } catch (err) {
        status = 'failed';
        failureCount = 1;
        errorMessage = err.message;
        // If token is stale/invalid, clear it from the user doc
        if (err.code === 'messaging/registration-token-not-registered') {
          await User.findByIdAndUpdate(targetUserId, { fcmToken: null });
        }
      }
    }

    // ── Persist the notification record ────────────────────────────────────
    const savedNotification = await Notification.create({
      title,
      subtitle,
      body,
      imageUrl,
      targetType,
      topic: targetType === 'topic' ? topic : targetType === 'all' ? 'all_users' : null,
      targetUserId: targetType === 'individual' ? targetUserId : null,
      targetUserFcmToken,
      data,
      status,
      successCount,
      failureCount,
      fcmMessageId,
      errorMessage,
      sentBy: req.admin?._id || null
    });

    return res.status(200).json({
      success: status !== 'failed',
      message:
        status === 'sent'
          ? 'Push notification sent successfully!'
          : status === 'partial'
          ? 'Notification sent with some failures.'
          : 'Notification failed to send.',
      data: savedNotification
    });
  } catch (error) {
    console.error('[Notification] sendNotification error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

// ─── @route  GET /api/notifications ──────────────────────────────────────────

exports.getNotifications = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.targetType) filter.targetType = req.query.targetType;
    if (req.query.status) filter.status = req.query.status;

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('targetUserId', 'firstName lastName email phone'),
      Notification.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Notification] getNotifications error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─── @route  GET /api/notifications/:id ──────────────────────────────────────

exports.getNotificationById = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id).populate(
      'targetUserId',
      'firstName lastName email phone'
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.status(200).json({ success: true, data: notification });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─── @route  DELETE /api/notifications/:id ───────────────────────────────────

exports.deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.status(200).json({ success: true, message: 'Notification deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
