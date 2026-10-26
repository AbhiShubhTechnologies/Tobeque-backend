/**
 * routes/adminNotification.js
 * In-app Admin Notifications REST & SSE routes.
 * All routes require admin authentication.
 */

const express = require('express');
const router = express.Router();
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  streamNotifications
} = require('../controllers/adminNotification.controller');
const { protect } = require('../middlewares/auth');

// All routes require authentication
router.use(protect);

// GET   /api/admin-notifications/stream       — Real-time SSE live stream
router.get('/stream', streamNotifications);

// GET   /api/admin-notifications/unread-count — Unread notification count
router.get('/unread-count', getUnreadCount);

// PATCH /api/admin-notifications/read-all     — Mark all as read
router.patch('/read-all', markAllAsRead);

// GET   /api/admin-notifications              — Paginated notification list
router.get('/', getNotifications);

// PATCH /api/admin-notifications/:id/read     — Mark single notification as read
router.patch('/:id/read', markAsRead);

// DELETE /api/admin-notifications/:id         — Remove a notification
router.delete('/:id', deleteNotification);

module.exports = router;
