const jwt = require('jsonwebtoken');
const { User } = require('../models');

// Protect route for regular users (not admins)
const protectUser = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'supersecretjwtsecretkeyshouldbecomplex39284'
      );

      // Ensure it's a user token (not admin)
      if (decoded.type !== 'user') {
        return res.status(401).json({
          success: false,
          error: 'Not authorized — invalid token type'
        });
      }

      req.user = await User.findById(decoded.id).select('-password -otpCode -otpExpiry');

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Not authorized, user not found'
        });
      }

      if (req.user.status === 'blocked') {
        return res.status(403).json({
          success: false,
          error: 'Your account has been blocked'
        });
      }

      const clientType = decoded.client || 'app';
      const now = Date.now();
      const lastActive = req.user.lastActiveAt ? new Date(req.user.lastActiveAt).getTime() : now;

      if (clientType === 'web') {
        // Web sessions expire after 24 hours of inactivity or token age
        const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
        if (now - lastActive > TWENTY_FOUR_HOURS_MS) {
          return res.status(401).json({
            success: false,
            error: 'Web session expired (24 hours inactivity limit). Please log in again.'
          });
        }
      } else {
        // App client — 7-day rolling inactivity window
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (now - lastActive > SEVEN_DAYS_MS) {
          return res.status(401).json({
            success: false,
            error: 'Session expired due to 7 days of inactivity. Please log in again.'
          });
        }
      }

      // Update lastActiveAt if more than 5 minutes have passed since last update (avoids DB spamming)
      if (!req.user.lastActiveAt || now - lastActive > 5 * 60 * 1000) {
        req.user.lastActiveAt = new Date();
        await req.user.save().catch((err) => console.error('Error updating lastActiveAt:', err));
      }

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized, token failed or expired'
      });
    }
  } else {
    return res.status(401).json({
      success: false,
      error: 'Not authorized, no token provided'
    });
  }
};

module.exports = { protectUser };
