const mongoose = require('mongoose');

const accountDeletionRequestSchema = new mongoose.Schema(
  {
    identifier: {
      type: String,
      required: [true, 'Email or phone number is required'],
      trim: true,
    },
    reason: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'processed', 'rejected'],
      default: 'pending',
    },
    ipAddress: {
      type: String,
      default: '',
    },
    // ── Deletion History (OTP-verified auto-deletions) ─────────────────────
    // Set when the account was actually deleted via OTP verification flow.
    // Allows admin to see exactly who deleted their account, when, and what data was removed.
    deletedViaOtp: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    // Snapshot of user data captured right before deletion (for admin audit trail)
    userSnapshot: {
      type: Object,
      default: null,
    },
    // How many orders were anonymized during deletion
    ordersAnonymized: {
      type: Number,
      default: 0,
    },
    refundsAnonymized: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AccountDeletionRequest', accountDeletionRequestSchema);
