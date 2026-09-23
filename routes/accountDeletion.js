const express = require('express');
const router = express.Router();
const {
  submitDeletionRequest,
  requestDeletionOtp,
  verifyAndDeleteAccount,
  getDeletionRequests,
  updateRequestStatus,
} = require('../controllers/accountDeletion.controller');
const { protect, authorize } = require('../middlewares/auth');

// ── Public Routes ──────────────────────────────────────────────────────────────
// Step 1: Send OTP to phone for identity verification before deletion
router.post('/request-otp', requestDeletionOtp);

// Step 2: Verify OTP and permanently delete the account + personal data
router.post('/verify-and-delete', verifyAndDeleteAccount);

// Legacy: Submit a manual deletion request (kept for backward compatibility)
router.post('/request', submitDeletionRequest);

// ── Protected Admin Routes ─────────────────────────────────────────────────────
router.use(protect);
router.use(authorize('superadmin', 'manager'));

router.get('/requests', getDeletionRequests);
router.put('/requests/:id/status', updateRequestStatus);

module.exports = router;
