const mongoose = require('mongoose');

/**
 * AdminNotification Model
 * Stores in-app alerts and notifications for store administrators.
 * Tracks order events, unread status, and metadata for fast dashboard alerting.
 */
const AdminNotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      default: 'New Order Received',
      trim: true,
      maxlength: 120
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      maxlength: 500
    },
    type: {
      type: String,
      enum: ['order', 'system', 'refund', 'inventory'],
      default: 'order'
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
      index: true
    },
    orderNumber: {
      type: String,
      trim: true,
      default: null,
      index: true
    },
    customerName: {
      type: String,
      trim: true,
      default: ''
    },
    amount: {
      type: Number,
      default: 0
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true, versionKey: false }
  }
);

// Indexes for high performance querying
AdminNotificationSchema.index({ createdAt: -1 });
AdminNotificationSchema.index({ isRead: 1, createdAt: -1 });

module.exports = mongoose.model('AdminNotification', AdminNotificationSchema);
