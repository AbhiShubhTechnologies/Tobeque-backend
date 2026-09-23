const AccountDeletionRequest = require('../models/accountDeletionRequest');

// @desc   Submit a public account deletion request (no auth required)
// @route  POST /api/account-deletion/request
exports.submitDeletionRequest = async (req, res, next) => {
  try {
    const { identifier, reason } = req.body;

    if (!identifier || !identifier.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Email or phone number is required.',
      });
    }

    // Prevent duplicate pending requests for the same identifier
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
      message: 'Your account deletion request has been received. We will process it within 30 days as per our data deletion policy.',
      data: { id: request._id },
    });
  } catch (error) {
    next(error);
  }
};

// @desc   Get all deletion requests (Admin)
// @route  GET /api/account-deletion/requests
exports.getDeletionRequests = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

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

// @desc   Update deletion request status (Admin)
// @route  PUT /api/account-deletion/requests/:id/status
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
