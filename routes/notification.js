/**
 * routes/notification.js
 * Push Notification REST API routes.
 * All routes require admin authentication.
 */

const express = require('express');
const router = express.Router();
const {
  sendNotification,
  getNotifications,
  getNotificationById,
  deleteNotification
} = require('../controllers/notification.controller');

const { protect } = require('../middlewares/auth');

// All notification routes are protected
router.use(protect);

// POST   /api/notifications/send      — Compose & dispatch notification
router.post('/send', sendNotification);

// GET    /api/notifications            — Paginated history
router.get('/', getNotifications);

// GET    /api/notifications/:id        — Single notification detail
router.get('/:id', getNotificationById);

// DELETE /api/notifications/:id        — Remove from history
router.delete('/:id', deleteNotification);

module.exports = router;
