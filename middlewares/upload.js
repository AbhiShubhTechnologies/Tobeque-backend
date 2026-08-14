const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Disk Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'uploads/misc';
    
    if (req.originalUrl.includes('products')) {
      folder = 'uploads/products';
    } else if (req.originalUrl.includes('categories')) {
      folder = 'uploads/categories';
    } else if (req.originalUrl.includes('banners')) {
      folder = 'uploads/banners';
    } else if (req.originalUrl.includes('season-collection')) {
      folder = 'uploads/season';
    } else if (req.originalUrl.includes('blogs')) {
      folder = 'uploads/blogs';
    } else if (req.originalUrl.includes('settings') || req.originalUrl.includes('site')) {
      folder = 'uploads/site';
    } else if (req.originalUrl.includes('profile') || req.originalUrl.includes('customers')) {
      folder = 'uploads/users';
    } else if (req.originalUrl.includes('refund-requests')) {
      folder = 'uploads/refunds';
    }

    const fullPath = path.join(__dirname, '..', folder);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }

    // Attach target subfolder to req for path normalization
    req._uploadSubfolder = folder;

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
