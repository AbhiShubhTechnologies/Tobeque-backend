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
// Ensure uploads folders exist
const uploadDirs = [
  'uploads',
  'uploads/products',
  'uploads/banners',
  'uploads/site',
  'uploads/misc'
];
uploadDirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Map Static Assets Folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
