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
  },
  { timestamps: true }
);

module.exports = mongoose.model('AccountDeletionRequest', accountDeletionRequestSchema);
