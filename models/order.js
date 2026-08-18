const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  subtotal: {
    type: Number,
    required: true,
    default: 0.00
  },
  taxAmount: {
    type: Number,
    required: true,
    default: 0.00
  },
  shippingCost: {
    type: Number,
    required: true,
    default: 0.00
  },
  discountAmount: {
    type: Number,
    required: true,
    default: 0.00
  },
  couponCode: {
    type: String
  },
  totalAmount: {
    type: Number,
    required: true,
    default: 0.00
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    required: true,
    default: 'cod'
  },
  shippingStatus: {
    type: String,
    enum: ['pending', 'packing', 'shipped', 'out_for_delivery', 'delivered', 'returned', 'cancelled'],
    default: 'pending'
  },
  shippingMethod: {
    type: String
  },
  shippingAddress: {
    type: String,
    required: true
  },
  billingAddress: {
    type: String
  },
  trackingNumber: {
    type: String
  },
  notes: {
    type: String
  },
  companyName: {
    type: String,
    default: ''
  },
  companyGst: {
    type: String,
    default: ''
  },
  adminNotes: {
    type: String
  },
  razorpayOrderId: {
    type: String
  },
  razorpayPaymentId: {
    type: String
  },

  // ── Shiprocket Integration Fields ──────────────────────────────────────────
  shiprocketOrderId: {
    type: Number, // Shiprocket's internal order ID (returned after order creation)
    default: null
  },
  shiprocketShipmentId: {
    type: Number, // Shiprocket's shipment ID (used for AWB, label, pickup)
    default: null
  },
  shiprocketAWB: {
    type: String, // Air Waybill number (main tracking number from courier)
    default: null
  },
  shiprocketCourierName: {
    type: String, // e.g. "Delhivery Surface", "BlueDart"
    default: null
  },
  shiprocketStatus: {
    type: String, // Human-readable status from Shiprocket e.g. "PICKUP SCHEDULED"
    default: null
  },
  shiprocketStatusId: {
    type: Number, // Numeric status code from Shiprocket
    default: null
  },
  shiprocketLabelUrl: {
    type: String, // PDF URL for the shipping label
    default: null
  },
  shiprocketPickupDate: {
    type: String, // Date string YYYY-MM-DD for scheduled pickup
    default: null
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
      ret.id = ret._id ? ret._id.toString() : ret.id;
      delete ret._id;
      try { if (typeof ret.shippingAddress === 'string') ret.shippingAddress = JSON.parse(ret.shippingAddress); } catch (e) {}
      try { if (typeof ret.billingAddress === 'string') ret.billingAddress = JSON.parse(ret.billingAddress); } catch (e) {}
    }
  },
  toObject: {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
      ret.id = ret._id ? ret._id.toString() : ret.id;
      delete ret._id;
      try { if (typeof ret.shippingAddress === 'string') ret.shippingAddress = JSON.parse(ret.shippingAddress); } catch (e) {}
      try { if (typeof ret.billingAddress === 'string') ret.billingAddress = JSON.parse(ret.billingAddress); } catch (e) {}
    }
  }
});

// Virtual for items
OrderSchema.virtual('items', {
  ref: 'OrderItem',
  localField: '_id',
  foreignField: 'order'
});

// Virtual for payments
OrderSchema.virtual('payments', {
  ref: 'Payment',
  localField: '_id',
  foreignField: 'order'
});

module.exports = mongoose.model('Order', OrderSchema);
