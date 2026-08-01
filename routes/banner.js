const express = require('express');
const router = express.Router();
const { getBanners, createBanner, updateBanner, deleteBanner } = require('../controllers/banner.controller');
const { protect, authorize } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

// Public Routes
router.get('/', getBanners);

// Protected Admin Routes
router.use(protect);

router.post('/', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'mobileImage', maxCount: 1 }]), createBanner);
router.put('/:id', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'mobileImage', maxCount: 1 }]), updateBanner);
router.delete('/:id', authorize('superadmin', 'manager'), deleteBanner);

module.exports = router;
