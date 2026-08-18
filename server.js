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
// ─────────────────────────────────────────────────────────────────────────────
// Persistent uploads directory resolution
// Priority:
//   1. UPLOAD_DIR env variable (manually configured)
//   2. Auto-detect: walk up from __dirname to find a writable home/parent dir
//      On Hostinger: /home/u123456789/ — uploads survive Node.js restarts there
//   3. Fallback: ./uploads inside the backend directory
// ─────────────────────────────────────────────────────────────────────────────
const resolveUploadBase = () => {
  // 1. Explicit override via env
  if (process.env.UPLOAD_DIR) {
    return path.resolve(process.env.UPLOAD_DIR);
  }

  // 2. Auto-detect persistent directory on Linux hosts (Hostinger, cPanel, VPS)
  //    Walk up from the backend folder to find the home directory
  if (process.platform !== 'win32') {
    let current = path.resolve(__dirname);
    for (let i = 0; i < 5; i++) {
      const parent = path.dirname(current);
      if (parent === current) break; // Reached filesystem root
      // Check if parent looks like a home directory (e.g. /home/u123456789)
      if (/^\/home\/[^/]+$/.test(parent) || /^\/root$/.test(parent)) {
        const persistentPath = path.join(parent, 'tobeque-uploads');
        console.log(`[Uploads] Auto-detected persistent uploads path: ${persistentPath}`);
        return persistentPath;
      }
      current = parent;
    }
    // Also try OS homedir
    const osHome = require('os').homedir();
    if (osHome && osHome !== '/' && fs.existsSync(osHome)) {
      const persistentPath = path.join(osHome, 'tobeque-uploads');
      console.log(`[Uploads] Using OS homedir for persistent uploads: ${persistentPath}`);
      return persistentPath;
    }
  }

  // 3. Fallback — local uploads folder (NOTE: may be wiped on Hostinger restarts)
  console.warn('[Uploads] ⚠️  Using local uploads folder — images may not persist after server restart. Set UPLOAD_DIR in .env to fix this.');
  return path.join(__dirname, 'uploads');
};

const UPLOAD_BASE = resolveUploadBase();
console.log(`[Uploads] Storage directory: ${UPLOAD_BASE}`);

// Ensure uploads folders exist
const uploadSubdirs = ['products', 'categories', 'banners', 'season', 'blogs', 'site', 'users', 'refunds', 'misc'];
[UPLOAD_BASE, ...uploadSubdirs.map(d => path.join(UPLOAD_BASE, d))].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Map Static Assets Folder — serves from the same persistent directory
app.use('/uploads', express.static(UPLOAD_BASE));

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
