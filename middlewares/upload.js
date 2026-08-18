const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// UPLOAD_DIR can be set in .env to an absolute persistent path (e.g. /home/user/uploads)
// This prevents image loss on server restarts on Hostinger/shared hosting
const UPLOAD_BASE = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', 'uploads');


// Configure Disk Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subfolder = 'misc';
    
    if (req.originalUrl.includes('products')) {
      subfolder = 'products';
    } else if (req.originalUrl.includes('categories')) {
      subfolder = 'categories';
    } else if (req.originalUrl.includes('banners')) {
      subfolder = 'banners';
    } else if (req.originalUrl.includes('season-collection')) {
      subfolder = 'season';
    } else if (req.originalUrl.includes('blogs')) {
      subfolder = 'blogs';
    } else if (req.originalUrl.includes('settings') || req.originalUrl.includes('site')) {
      subfolder = 'site';
    } else if (req.originalUrl.includes('profile') || req.originalUrl.includes('customers')) {
      subfolder = 'users';
    } else if (req.originalUrl.includes('refund-requests')) {
      subfolder = 'refunds';
    }

    const fullPath = path.join(UPLOAD_BASE, subfolder);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }

    // Attach target subfolder to req for path normalization
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

const multerUpload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB Max
  fileFilter: fileFilter
});

// Helper to convert full OS disk path to relative web path (/uploads/...)
const normalizeFilePaths = (req) => {
  const normalize = (file) => {
    if (file && file.filename) {
      const subfolder = req._uploadSubfolder || 'uploads/misc';
      file.path = `/${subfolder}/${file.filename}`.replace(/\\/g, '/');
    }
  };

  if (req.file) {
    normalize(req.file);
  }
  if (req.files) {
    if (Array.isArray(req.files)) {
      req.files.forEach(normalize);
    } else if (typeof req.files === 'object') {
      Object.values(req.files).forEach(fileArr => {
        if (Array.isArray(fileArr)) fileArr.forEach(normalize);
      });
    }
  }
};

// Wrap multer middleware methods to automatically normalize file paths
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
