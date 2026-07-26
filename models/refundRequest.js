const mongoose = require('mongoose');

const RefundRequestSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },

  // The order number string (e.g. ORD-20250101-1234)
  orderId: { type: String, required: true, trim: true },
  // Reference to the actual Order document
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

  // --- Request Type ---
  requestType: {
    type: String,
    enum: ['return', 'cancel'],
    default: 'return'
  },

  // --- Return-specific ---
  returnReason: {
    type: String,
    enum: ['wrong_size', 'damaged_defective', 'not_as_described', 'changed_mind', 'other', ''],
    default: ''
  },

  // --- Cancel-specific ---
  cancelReason: { type: String, default: '' },

  // Legacy free-text reason (kept for backward compat)
  reason: { type: String, default: '' },

  // --- Status ---
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'rejected', 'auto_cancelled'],
    default: 'pending'
  },
  adminNotes: { type: String, default: '' },
  proofImage: { type: String, default: '' },

  // Link to registered user
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  requestedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('RefundRequest', RefundRequestSchema);
