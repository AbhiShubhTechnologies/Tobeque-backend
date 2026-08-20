const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { testConnection } = require('./config/db');
const errorHandler = require('./middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Central Logger in dev mode
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Security Middleware
app.use(helmet({
  crossOriginResourcePolicy: false // Allows loading static images across domains
}));
app.use(cors());

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/', (req, res) => {
  res.send('Server Working');
});
// ── Uploads directory setup ───────────────────────────────────────────────────
// UPLOAD_DIR env → persistent path outside app (survives redeployments)
// Fallback       → ./uploads inside the backend directory (local dev)
const UPLOAD_BASE = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, 'uploads');

const localUploads = path.join(__dirname, 'uploads');

// Auto-create all needed subfolders on every startup
const uploadSubdirs = ['products', 'categories', 'banners', 'season', 'blogs', 'site', 'users', 'refunds', 'misc'];
[UPLOAD_BASE, ...uploadSubdirs.map(d => path.join(UPLOAD_BASE, d))].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
// Also ensure local ./uploads exists (for dev / legacy fallback)
[localUploads, ...uploadSubdirs.map(d => path.join(localUploads, d))].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Auto-copy existing images from legacy/versioned folders to UPLOAD_BASE (preserves old images)
const syncLegacyUploads = (sourceDir, targetDir) => {
  if (!fs.existsSync(sourceDir) || sourceDir === targetDir) return;
  try {
    const items = fs.readdirSync(sourceDir, { withFileTypes: true });
    for (const item of items) {
      const srcPath = path.join(sourceDir, item.name);
      const destPath = path.join(targetDir, item.name);
      if (item.isDirectory()) {
        if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
        syncLegacyUploads(srcPath, destPath);
      } else if (item.isFile()) {
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
  } catch (err) {
    console.warn(`[Storage] Auto-sync warning for ${sourceDir}:`, err.message);
  }
};

// Execute sync on startup
if (UPLOAD_BASE !== localUploads) {
  syncLegacyUploads(localUploads, UPLOAD_BASE);
}
const ftpRootUploads = '/tobeque-uploads';
if (fs.existsSync(ftpRootUploads)) {
  syncLegacyUploads(ftpRootUploads, UPLOAD_BASE);
}

console.log(`[Storage] Upload base: ${UPLOAD_BASE}`);

// ── Serve /uploads from ALL possible locations ────────────────────────────────
// Express tries each static path in order and returns the first match found.

// 1. Primary: persistent UPLOAD_DIR path (new & synced uploads live here)
app.use('/uploads', express.static(UPLOAD_BASE, { maxAge: '7d' }));

// 2. Fallback: local ./uploads inside backend dir
if (UPLOAD_BASE !== localUploads) {
  app.use('/uploads', express.static(localUploads, { maxAge: '7d' }));
}

// 3. Fallback: FTP-root /tobeque-uploads
if (fs.existsSync(ftpRootUploads)) {
  app.use('/uploads', express.static(ftpRootUploads, { maxAge: '7d' }));
}

// ── Diagnostic endpoint ───────────────────────────────────────────────────────
app.get('/api/debug-uploads', (req, res) => {
  const result = {
    uploadBase: UPLOAD_BASE,
    localUploads,
    usingPersistentDir: UPLOAD_BASE !== localUploads,
    subdirs: {}
  };
  const subdirs = ['products', 'categories', 'banners', 'season', 'site', 'users', 'refunds', 'misc', 'blogs'];
  subdirs.forEach(sub => {
    const p1 = path.join(UPLOAD_BASE, sub);
    const p2 = path.join(localUploads, sub);
    const files1 = fs.existsSync(p1) ? fs.readdirSync(p1) : [];
    const files2 = (p1 !== p2 && fs.existsSync(p2)) ? fs.readdirSync(p2) : [];
    result.subdirs[sub] = {
      persistent: { path: p1, count: files1.length, sample: files1.slice(0, 2) },
      ...(p1 !== p2 ? { legacy: { path: p2, count: files2.length, sample: files2.slice(0, 2) } } : {})
    };
  });
  res.json(result);
});

// Mount API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/products', require('./routes/product'));
app.use('/api/categories', require('./routes/category'));
app.use('/api/orders', require('./routes/order'));
app.use('/api/customers', require('./routes/customer'));
app.use('/api/coupons', require('./routes/coupon'));
app.use('/api/banners', require('./routes/banner'));
app.use('/api/reviews', require('./routes/review'));
app.use('/api/reports', require('./routes/report'));
app.use('/api/settings', require('./routes/setting'));
app.use('/api/user-auth', require('./routes/userAuth'));
app.use('/api/season-collection', require('./routes/seasonCollection'));
app.use('/api/inquiries', require('./routes/inquiryRoutes'));
app.use('/api/faqs', require('./routes/faq'));
app.use('/api/job-applications', require('./routes/jobApplication'));
app.use('/api/refund-requests', require('./routes/refundRequest'));
app.use('/api/subscribers', require('./routes/subscriber'));
// ─── Shiprocket Shipping Integration ─────────────────────────────────────────
// NOTE: URL prefix intentionally avoids the word "shiprocket" (webhook restriction)
app.use('/api/shipping', require('./routes/shiprocket'));
app.use('/api/blogs', require('./routes/blog'));
app.use('/api/job-postings', require('./routes/jobPosting'));
app.use('/api/community-styles', require('./routes/communityStyle'));
app.use('/api/about-us', require('./routes/aboutUs'));
app.use('/api/contact', require('./routes/contact'));

// Root Status check
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    message: 'Tobeque Admin API Service is up and running!',
    timestamp: new Date()
  });
});

// Global central error handler middleware
app.use(errorHandler);

// Connect DB & Start Server
const startServer = async () => {
  try {
    // 1. Authenticate connection (MongoDB)
    await testConnection();

    // 2. Bind port and start listening
    const server = app.listen(PORT, () => {
      console.log(`===================================================`);
      console.log(`   SERVER IS RUNNING IN ${(process.env.NODE_ENV || 'development').toUpperCase()} MODE`);
      console.log(`   API Listening at: http://localhost:${PORT}`);
      console.log(`===================================================`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Error: Port ${PORT} is already in use by another process.`);
        console.error(`👉 Stop the existing process or run: npx kill-port ${PORT}\n`);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
