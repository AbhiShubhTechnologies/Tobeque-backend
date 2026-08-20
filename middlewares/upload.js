/**
 * upload.js — Multer disk storage middleware.
 *
 * HOW IMAGES PERSIST ON HOSTINGER:
 * ─────────────────────────────────────────────────────────────────────────────
 * Set UPLOAD_DIR in your Hostinger .env to an ABSOLUTE path OUTSIDE the app
 * folder. This folder is never touched during redeployments, so images survive.
 *
 *   Example on Hostinger:
 *   UPLOAD_DIR=/home/u123456789/uploads
 *   (Replace u123456789 with your actual Hostinger account username)
 *
 * How to find your username on Hostinger:
 *   → hPanel → File Manager → you'll see /home/u123456789/ at the top
 *
 * The backend already serves this folder via:
 *   app.use('/uploads', express.static(UPLOAD_BASE))   ← in server.js
 *
 * If UPLOAD_DIR is NOT set, images save to ./uploads inside the app folder
 * and will break on redeploy (development use only).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Resolve upload base: use UPLOAD_DIR env if set, otherwise fall back to ./uploads
const UPLOAD_BASE = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', 'uploads');

// Log which path is being used on startup
if (process.env.UPLOAD_DIR) {
  console.log(`[Upload] ✅ Persistent storage: ${UPLOAD_BASE}`);
} else {
  console.warn(`[Upload] ⚠️  UPLOAD_DIR not set — images save to ./uploads (will break on Hostinger redeploy!)`);
  console.warn(`[Upload]    Set UPLOAD_DIR=/home/<your-username>/uploads in Hostinger .env to fix this.`);
}

// ── Map request URL to subfolder ─────────────────────────────────────────────
function getSubfolder(req) {
  const url = req.originalUrl || '';
  if (url.includes('products'))          return 'products';
  if (url.includes('categories'))        return 'categories';
  if (url.includes('banners'))           return 'banners';
  if (url.includes('season-collection')) return 'season';
  if (url.includes('blogs'))             return 'blogs';
  if (url.includes('settings') || url.includes('site')) return 'site';
  if (url.includes('profile') || url.includes('customers')) return 'users';
  if (url.includes('refund-requests'))   return 'refunds';
  return 'misc';
}

// ── Disk Storage ──────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subfolder = getSubfolder(req);
    const fullPath = path.join(UPLOAD_BASE, subfolder);

    // Create folder if it doesn't exist
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }

    // Attach subfolder to req so normalizeFilePaths can build the web path
    req._uploadSubfolder = `uploads/${subfolder}`;

    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueFilename = `${cleanName}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueFilename);
  }
});

// ── File Filter ───────────────────────────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp|mp4|webm|ogg|mov/i;
  if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image and video files (JPEG, JPG, PNG, GIF, WEBP, MP4, WEBM, OGG, MOV) are allowed!'), false);
  }
};

const multerUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  fileFilter,
});

// ── Normalize file paths after upload ────────────────────────────────────────
// Converts the absolute disk path to a relative web path like /uploads/products/file.jpg
const normalizeFilePaths = (req) => {
  const normalize = (file) => {
    if (file && file.filename) {
      const subfolder = req._uploadSubfolder || 'uploads/misc';
      file.path = `/${subfolder}/${file.filename}`.replace(/\\/g, '/');
    }
  };

  if (req.file) normalize(req.file);
  if (req.files) {
    if (Array.isArray(req.files)) {
      req.files.forEach(normalize);
    } else if (typeof req.files === 'object') {
      Object.values(req.files).forEach(arr => {
        if (Array.isArray(arr)) arr.forEach(normalize);
      });
    }
  }
};

// ── Wrapped Multer Methods ────────────────────────────────────────────────────
const upload = {
  single: (fieldname) => (req, res, next) => {
    multerUpload.single(fieldname)(req, res, (err) => {
      if (err) return next(err);
      normalizeFilePaths(req);
      next();
    });
  },
  array: (fieldname, maxCount) => (req, res, next) => {
    multerUpload.array(fieldname, maxCount)(req, res, (err) => {
      if (err) return next(err);
      normalizeFilePaths(req);
      next();
    });
  },
  fields: (fields) => (req, res, next) => {
    multerUpload.fields(fields)(req, res, (err) => {
      if (err) return next(err);
      normalizeFilePaths(req);
      next();
    });
  },
  any: () => (req, res, next) => {
    multerUpload.any()(req, res, (err) => {
      if (err) return next(err);
      normalizeFilePaths(req);
      next();
    });
  }
};

module.exports = upload;
