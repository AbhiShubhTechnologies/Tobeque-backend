const express = require('express');
const router = express.Router();
const {
  sendOtp,
  verifyOtp,
  validateCoupon,
  getUserProfile,
  getUserOrders,
  updateUserProfile,
  createOrder,
  uploadProfilePhoto,
  createRazorpayOrder,
  verifyRazorpayPayment,
  getRazorpayConfig,
  updateFcmToken,
  removeFcmToken
} = require('../controllers/userAuth.controller');
const { protectUser } = require('../middlewares/userAuth');
const upload = require('../middlewares/upload');

// Public routes
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/validate-coupon', validateCoupon);
router.get('/razorpay/config', getRazorpayConfig);

// Protected user routes
router.get('/profile', protectUser, getUserProfile);
router.put('/profile', protectUser, updateUserProfile);
router.get('/orders', protectUser, getUserOrders);
router.post('/orders', protectUser, createOrder);
router.post('/profile/photo', protectUser, upload.single('photo'), uploadProfilePhoto);
router.post('/razorpay/create-order', protectUser, createRazorpayOrder);
router.post('/razorpay/verify', protectUser, verifyRazorpayPayment);

// Push notification FCM token management
router.put('/fcm-token', protectUser, updateFcmToken);
router.delete('/fcm-token', protectUser, removeFcmToken);

module.exports = router;
