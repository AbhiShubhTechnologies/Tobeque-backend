const express = require('express');
const router = express.Router();
const { getProducts, getProductById, createProduct, updateProduct, deleteProduct, deleteProductImage } = require('../controllers/product.controller');
const { protect, authorize } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

// ─── PUBLIC ROUTES (no auth required) ───────────────────────────────────────
// These are used by the frontend-website to display products
router.get('/', getProducts);
router.get('/:id', getProductById);

// ─── PROTECTED ROUTES (admin JWT required) ───────────────────────────────────
router.post(
  '/',
  protect,
  upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'images', maxCount: 10 },
    { name: 'hotRightNowMedia', maxCount: 1 },
    { name: 'colorSwatchImages', maxCount: 20 }
  ]),
  createProduct
);

router.put(
  '/:id',
  protect,
  upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'images', maxCount: 10 },
    { name: 'hotRightNowMedia', maxCount: 1 },
    { name: 'colorSwatchImages', maxCount: 20 }
  ]),
  updateProduct
);

router.delete('/:id', protect, authorize('superadmin', 'manager'), deleteProduct);
router.delete('/:id/images/:imageId', protect, authorize('superadmin', 'manager'), deleteProductImage);

module.exports = router;
