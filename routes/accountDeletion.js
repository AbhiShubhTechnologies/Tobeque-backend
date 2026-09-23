const express = require('express');
const router = express.Router();
const {
  submitDeletionRequest,
  getDeletionRequests,
  updateRequestStatus,
} = require('../controllers/accountDeletion.controller');
const { protect, authorize } = require('../middlewares/auth');

// ── Public Route ───────────────────────────────────────────────────────────────
// Anyone (including unauthenticated users) can submit a deletion request
router.post('/request', submitDeletionRequest);

// ── Protected Admin Routes ─────────────────────────────────────────────────────
router.use(protect);
router.use(authorize('superadmin', 'manager'));

router.get('/requests', getDeletionRequests);
router.put('/requests/:id/status', updateRequestStatus);

module.exports = router;
