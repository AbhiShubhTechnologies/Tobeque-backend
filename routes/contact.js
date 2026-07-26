const express = require('express');
const router = express.Router();
const {
  submitContactForm,
  getSubmissions,
  updateSubmissionStatus,
  deleteSubmission,
  getContactSettings,
  updateContactSettings,
} = require('../controllers/contact.controller');
const { protect, authorize } = require('../middlewares/auth');

// ── Public Routes ──────────────────────────────────────────────────────────────
router.post('/submit', submitContactForm);
router.get('/settings', getContactSettings);

// ── Protected Admin Routes ─────────────────────────────────────────────────────
router.use(protect);
router.use(authorize('superadmin', 'manager'));

router.get('/submissions', getSubmissions);
router.put('/submissions/:id/status', updateSubmissionStatus);
router.delete('/submissions/:id', deleteSubmission);
router.put('/settings', updateContactSettings);

module.exports = router;
