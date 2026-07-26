const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let folder = 'tobeque/misc';
    
    if (req.originalUrl.includes('products')) {
      folder = 'tobeque/products';
    } else if (req.originalUrl.includes('categories')) {
      folder = 'tobeque/categories';
    } else if (req.originalUrl.includes('banners')) {
      folder = 'tobeque/banners';
    } else if (req.originalUrl.includes('season-collection')) {
      folder = 'tobeque/season';
    } else if (req.originalUrl.includes('blogs')) {
      folder = 'tobeque/blogs';
    } else if (req.originalUrl.includes('settings') || req.originalUrl.includes('site')) {
      folder = 'tobeque/site';
    } else if (req.originalUrl.includes('profile') || req.originalUrl.includes('customers')) {
      folder = 'tobeque/users';
    } else if (req.originalUrl.includes('refund-requests')) {
      folder = 'tobeque/refunds';
    }

    return {
      folder: folder,
      resource_type: 'auto', // Allows both images and videos
      public_id: `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
    };
  }
});

// File Filter rules
const fileFilter = (req, file, cb) => {
  const allowedExtensions = /jpeg|jpg|png|gif|webp|mp4|webm|ogg|mov/i;
  const isMatch = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
  const mimeTypeMatch = allowedExtensions.test(file.mimetype);

  if (isMatch && mimeTypeMatch) {
    cb(null, true);
  } else {
    cb(new Error('Only image and video files (JPEG, JPG, PNG, GIF, WEBP, MP4, WEBM, OGG, MOV) are allowed!'), false);
  }
};

// Initialize Multer
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB Max
  fileFilter: fileFilter
});

module.exports = upload;
