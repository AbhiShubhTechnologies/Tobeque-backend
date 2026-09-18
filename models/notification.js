const mongoose = require('mongoose');

/**
 * Notification Model
 * Stores every push notification dispatched from the admin panel.
 * Retains history for audit trail and analytics.
 */
const NotificationSchema = new mongoose.Schema(
  {
    // Notification content fields
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      maxlength: [100, 'Title must not exceed 100 characters']
    },
    subtitle: {
      type: String,
      trim: true,
      default: '',
      maxlength: [150, 'Subtitle must not exceed 150 characters']
    },
    body: {
      type: String,
      required: [true, 'Notification body is required'],
      trim: true,
      maxlength: [500, 'Body must not exceed 500 characters']
    },
    imageUrl: {
      type: String,
      default: null
    },

    // Targeting
    targetType: {
      type: String,
      enum: ['all', 'topic', 'individual'],
      default: 'all'
    },
    topic: {
      type: String,
      default: null // e.g. 'new_arrivals', 'sale', 'android', 'ios'
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    targetUserFcmToken: {
      type: String,
      default: null
    },

    // Deep-link data payload (passed through to the Flutter app)
    data: {
      type: Map,
      of: String,
      default: {}
    },

    // Send result tracking
    status: {
      type: String,
      enum: ['sent', 'failed', 'partial'],
      default: 'sent'
    },
    successCount: {
      type: Number,
      default: 0
    },
    failureCount: {
      type: Number,
      default: 0
    },
    fcmMessageId: {
      type: String,
      default: null // FCM message ID returned by Firebase
    },
    errorMessage: {
      type: String,
      default: null
    },

    // Sender (admin who triggered it)
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true, versionKey: false }
  }
);

// Index for efficient querying
NotificationSchema.index({ createdAt: -1 });
NotificationSchema.index({ targetType: 1 });
NotificationSchema.index({ status: 1 });

module.exports = mongoose.model('Notification', NotificationSchema);
