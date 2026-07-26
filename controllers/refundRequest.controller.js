const RefundRequest = require('../models/refundRequest');
const { Order } = require('../models');

const RETURN_WINDOW_DAYS = 7; // Days after delivery to request a return

// Helper: get order's delivered date estimate (we use updatedAt as proxy when status=delivered)
const isWithinReturnWindow = (order) => {
  if (!order.updatedAt) return true; // fallback: allow if no date
  const daysSince = (Date.now() - new Date(order.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince <= RETURN_WINDOW_DAYS;
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Submit a cancel or return request (protected)
// @route   POST /api/refund-requests
// @access  Private (user)
// ─────────────────────────────────────────────────────────────────────────────
const submitRefundRequest = async (req, res, next) => {
  try {
    const { name, email, phone, orderId, requestType, returnReason, cancelReason, reason } = req.body;

    if (!name || !email || !phone || !orderId) {
      return res.status(400).json({ success: false, error: 'Name, email, phone and order ID are required.' });
    }

    const type = requestType === 'cancel' ? 'cancel' : 'return';
    const userId = req.user.id;

    // Validate that this order belongs to the logged-in user
    const order = await Order.findOne({ orderNumber: orderId, user: userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found. Please make sure the Order ID is correct and belongs to your account.'
      });
    }

    // Check if a request already exists for this order
    const existingRequest = await RefundRequest.findOne({ order: order._id });
    if (existingRequest) {
      return res.status(409).json({
        success: false,
        error: `A ${existingRequest.requestType} request for this order already exists (Status: ${existingRequest.status}).`
      });
    }

    // ── CANCEL request logic ──────────────────────────────────────────────────
    if (type === 'cancel') {
      const cancellableStatuses = ['pending', 'confirmed', 'processing'];
      if (!cancellableStatuses.includes(order.orderStatus)) {
        return res.status(400).json({
          success: false,
          error: `This order cannot be cancelled because it is already "${order.orderStatus}". Only pending, confirmed, or processing orders can be cancelled.`
        });
      }

      let refundStatus = 'pending';
      let orderNewStatus = order.orderStatus;

      // Auto-cancel immediately if order is still pending
      if (order.orderStatus === 'pending') {
        order.orderStatus = 'cancelled';
        await order.save();
        orderNewStatus = 'cancelled';
        refundStatus = 'auto_cancelled';
      }
      // For confirmed/processing: leave order as-is, let admin review
      // (admin will cancel manually from OrderDetail page)

      const refund = await RefundRequest.create({
        name,
        email,
        phone,
        orderId,
        order: order._id,
        requestType: 'cancel',
        cancelReason: cancelReason || reason || '',
        reason: cancelReason || reason || '',
        status: refundStatus,
        userId
      });

      return res.status(201).json({
        success: true,
        message: order.orderStatus === 'cancelled'
          ? 'Your order has been cancelled successfully.'
          : 'Your cancellation request has been submitted. Our team will review it shortly.',
        refund,
        orderStatus: orderNewStatus
      });
    }

    // ── RETURN request logic ──────────────────────────────────────────────────
    if (order.orderStatus !== 'delivered') {
      return res.status(400).json({
        success: false,
        error: `Returns are only accepted for delivered orders. This order is currently "${order.orderStatus}".`
      });
    }

    if (!isWithinReturnWindow(order)) {
      return res.status(400).json({
        success: false,
        error: `The ${RETURN_WINDOW_DAYS}-day return window for this order has passed.`
      });
    }

    if (!returnReason) {
      return res.status(400).json({ success: false, error: 'Please select a reason for the return.' });
    }
    
    // Validate mandatory note field for returns
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ success: false, error: 'Please provide additional details in the note field.' });
    }

    let proofImage = '';
    if (req.file) {
      proofImage = req.file.path; // Cloudinary URL
    }

    const refund = await RefundRequest.create({
      name,
      email,
      phone,
      orderId,
      order: order._id,
      requestType: 'return',
      returnReason,
      reason: reason.trim(),
      proofImage,
      status: 'pending',
      userId
    });

    return res.status(201).json({
      success: true,
      message: 'Your return request has been submitted. We will review it and get back to you within 3–5 business days.',
      refund
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get refund/cancel requests for the logged-in user
// @route   GET /api/refund-requests/my
// @access  Private (user)
// ─────────────────────────────────────────────────────────────────────────────
const getMyRefundRequests = async (req, res, next) => {
  try {
    const requests = await RefundRequest.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, requests });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get all requests (admin)
// @route   GET /api/refund-requests
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
const getRefundRequests = async (req, res, next) => {
  try {
    const { status, requestType, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status && status !== 'all') query.status = status;
    if (requestType && requestType !== 'all') query.requestType = requestType;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [requests, total] = await Promise.all([
      RefundRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      RefundRequest.countDocuments(query)
    ]);

    res.json({ success: true, requests, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update request status (admin)
// @route   PUT /api/refund-requests/:id/status
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
const updateRefundStatus = async (req, res, next) => {
  try {
    const { status, adminNotes } = req.body;
    const validStatuses = ['pending', 'under_review', 'approved', 'rejected', 'auto_cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value' });
    }

    const request = await RefundRequest.findByIdAndUpdate(
      req.params.id,
      { status, ...(adminNotes !== undefined && { adminNotes }) },
      { new: true }
    );

    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    res.json({ success: true, request });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Delete request (admin)
// @route   DELETE /api/refund-requests/:id
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
const deleteRefundRequest = async (req, res, next) => {
  try {
    const request = await RefundRequest.findByIdAndDelete(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }
    res.json({ success: true, message: 'Request deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = { submitRefundRequest, getMyRefundRequests, getRefundRequests, updateRefundStatus, deleteRefundRequest };
