const mongoose = require('mongoose');

const CouponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['percentage', 'flat', 'fixed'],
    default: 'percentage',
    required: true
  },
  discountValue: {
    type: Number,
    required: true
  },
  minOrderAmount: {
    type: Number,
    default: 0.00
  },
  usageLimit: {
    type: Number,
    default: 100
  },
  usedCount: {
    type: Number,
    default: 0
  },
  startDate: {
    type: Date,
    required: true
  },
  expiryDate: {
    type: Date,
    required: true
  },
  status: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
      ret.id = ret._id ? ret._id.toString() : ret.id;
      delete ret._id;
    }
  },
  toObject: {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
      ret.id = ret._id ? ret._id.toString() : ret.id;
      delete ret._id;
    }
  }
});

module.exports = mongoose.model('Coupon', CouponSchema);
