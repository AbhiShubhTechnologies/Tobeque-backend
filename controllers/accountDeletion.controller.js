const AccountDeletionRequest = require('../models/accountDeletionRequest');
const { User, Order } = require('../models');
const RefundRequest = require('../models/refundRequest');
const { sendOtpViaSMS } = require('../utils/smsService');

const OTP_EXPIRY_MINUTES = 10;

// Standardize Indian phone numbers to +91XXXXXXXXXX
const normalizePhone = (p) => {
  if (!p) return '';
  const digits = String(p).replace(/\D/g, '');
  const last10 = digits.slice(-10);
  return last10 ? `+91${last10}` : String(p).trim();
};

const getPhoneSearchQuery = (p) => {
  const digits = String(p).replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (!last10) return { phone: String(p).trim() };
  return {
    $or: [
      { phone: `+91${last10}` },
      { phone: last10 },
      { phone: String(p).trim() },
    ],
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc   Step 1 — Send OTP to phone for deletion verification
// @route  POST /api/account-deletion/request-otp
// @access Public
// ─────────────────────────────────────────────────────────────────────────────
exports.requestDeletionOtp = async (req, res, next) => {
  try {
    const { phone } = req.body;

    if (!phone || String(phone).replace(/\D/g, '').length < 10) {
      return res.status(400).json({
        success: false,
        error: 'A valid 10-digit mobile number is required.',
      });
    }

    const normalizedPhone = normalizePhone(phone);
    const searchQuery = getPhoneSearchQuery(phone);

    // Intentionally DO NOT reveal whether the account exists (prevent enumeration)
    const user = await User.findOne(searchQuery);

    if (user && user.status !== 'blocked') {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      user.otpCode = otp;
      user.otpExpiry = expiry;
      await user.save();

      await sendOtpViaSMS(normalizedPhone, otp);
    }

    // Always return generic success to prevent account enumeration
    return res.status(200).json({
      success: true,
      message:
        'If this phone number is registered with Tobeque, you will receive a verification OTP shortly.',
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc   Step 2 — Verify OTP and permanently delete the account
// @route  POST /api/account-deletion/verify-and-delete
// @access Public
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyAndDeleteAccount = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Phone number and OTP are required.',
      });
    }

    const searchQuery = getPhoneSearchQuery(phone);
    const user = await User.findOne(searchQuery).select('+otpCode +otpExpiry');

    // Generic error — do not reveal account existence
    const invalidMsg = 'Invalid or expired OTP. Please request a new one and try again.';

    if (!user) {
      return res.status(401).json({ success: false, error: invalidMsg });
    }

    if (!user.otpCode || user.otpCode !== String(otp).trim()) {
      return res.status(401).json({ success: false, error: invalidMsg });
    }

    if (!user.otpExpiry || new Date() > new Date(user.otpExpiry)) {
      return res.status(401).json({ success: false, error: invalidMsg });
    }

    const userId = user._id;

    // ── Capture user snapshot BEFORE deletion (for admin audit trail) ────────
    const userSnapshot = {
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || '(no name)',
      phone: user.phone || null,
      email: user.email || null,
      gender: user.gender || null,
      status: user.status,
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt,
    };

    // ── 1. Anonymize Orders ────────────────────────────────────────────────
    const anonymizedOrders = await Order.updateMany(
      { user: userId },
      {
        $set: {
          user: null,
          shippingAddress: JSON.stringify({
            name: '[deleted]', phone: '[deleted]', street: '[deleted]',
            city: '[deleted]', state: '[deleted]', zip: '[deleted]', country: 'India',
          }),
          billingAddress: JSON.stringify({
            name: '[deleted]', phone: '[deleted]', street: '[deleted]',
            city: '[deleted]', state: '[deleted]', zip: '[deleted]', country: 'India',
          }),
        },
      }
    );

    // ── 2. Anonymize Refund Requests ───────────────────────────────────────
    const anonymizedRefunds = await RefundRequest.updateMany(
      { userId },
      {
        $set: {
          userId: null,
          name: '[deleted]',
          email: '[deleted]@deleted.invalid',
          phone: '[deleted]',
        },
      }
    );

    // ── 3. Log deletion history (before deleting user) ────────────────────
    // First check if a manual request exists for this user to update it;
    // otherwise create a fresh auto-deletion log record.
    const existingRequest = await AccountDeletionRequest.findOne({
      identifier: { $in: [user.phone, user.email].filter(Boolean) },
      status: 'pending',
    });

    const ipAddress =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '';

    const deletionLogData = {
      status: 'processed',
      deletedViaOtp: true,
      deletedAt: new Date(),
      userSnapshot,
      ordersAnonymized: anonymizedOrders.modifiedCount || 0,
      refundsAnonymized: anonymizedRefunds.modifiedCount || 0,
      ipAddress,
    };

    if (existingRequest) {
      Object.assign(existingRequest, deletionLogData);
      await existingRequest.save();
    } else {
      await AccountDeletionRequest.create({
        identifier: user.phone || user.email || 'unknown',
        reason: 'Account deleted via OTP verification on tobeque.com/delete-account',
        ...deletionLogData,
      });
    }

    // ── 4. Permanently delete the user ────────────────────────────────────
    await User.findByIdAndDelete(userId);

    return res.status(200).json({
      success: true,
      message:
        'Your Tobeque account and personal data have been permanently deleted. Order records have been anonymized for legal purposes.',
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc   Submit a manual deletion request (kept for backward compatibility)
// @route  POST /api/account-deletion/request
// @access Public
// ─────────────────────────────────────────────────────────────────────────────
exports.submitDeletionRequest = async (req, res, next) => {
  try {
    const { identifier, reason } = req.body;

    if (!identifier || !identifier.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Email or phone number is required.',
      });
    }

    const existing = await AccountDeletionRequest.findOne({
      identifier: identifier.trim(),
      status: 'pending',
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'A deletion request for this account is already pending. Our team will process it shortly.',
      });
    }

    const ipAddress =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '';

    const request = await AccountDeletionRequest.create({
      identifier: identifier.trim(),
      reason: (reason || '').trim(),
      ipAddress,
    });

    res.status(201).json({
      success: true,
      message: 'Your account deletion request has been received. We will process it within 30 days.',
      data: { id: request._id },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc   Get all deletion records (Admin) — both manual requests + OTP deletions
// @route  GET /api/account-deletion/requests
// @access Admin protected
// ─────────────────────────────────────────────────────────────────────────────
exports.getDeletionRequests = async (req, res, next) => {
  try {
    const { status, type, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    // type=otp → only OTP-verified deletions; type=manual → only manual requests
    if (type === 'otp') filter.deletedViaOtp = true;
    if (type === 'manual') filter.deletedViaOtp = { $ne: true };

    const total = await AccountDeletionRequest.countDocuments(filter);
    const requests = await AccountDeletionRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
      data: requests,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc   Update deletion request status (Admin)
// @route  PUT /api/account-deletion/requests/:id/status
// @access Admin protected
// ─────────────────────────────────────────────────────────────────────────────
exports.updateRequestStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['pending', 'processed', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value.' });
    }

    const request = await AccountDeletionRequest.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found.' });
    }

    res.status(200).json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
};
