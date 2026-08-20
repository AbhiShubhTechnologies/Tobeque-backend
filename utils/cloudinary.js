/**
 * cloudinary.js — Asset deletion utility.
 *
 * Handles deletion of both:
 * - Cloudinary-hosted images (by extracting publicId from URL)
 * - Locally stored files (from UPLOAD_DIR or legacy ./uploads/)
 */

const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Resolve the persistent upload base (same logic as upload.js and server.js)
const UPLOAD_BASE = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', 'uploads');

const LOCAL_UPLOADS = path.join(__dirname, '..', 'uploads');

const extractPublicId = (url) => {
  if (!url || typeof url !== 'string') return null;
  if (!url.includes('cloudinary.com')) return null;

  try {
    const cleanUrl = url.split('?')[0];
    const match = cleanUrl.match(/\/upload\/(?:v\d+\/)?(.+)$/);
    if (!match) return null;
    const withExt = match[1];
    return withExt.replace(/\.[^/.]+$/, '');
  } catch {
    return null;
  }
};

const deleteCloudinaryAsset = async (url) => {
  if (!url || typeof url !== 'string') return;

  // 1. Handle Cloudinary-hosted URLs
  if (url.includes('cloudinary.com')) {
    const publicId = extractPublicId(url);
    if (!publicId) return;
    try {
      const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
      if (result.result === 'not found') {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'video', invalidate: true });
      }
    } catch (err) {
      console.warn(`[Cloudinary] Could not delete asset "${publicId}":`, err.message);
    }
    return;
  }

  // 2. Handle local disk file deletion (path like /uploads/products/file.jpg)
  if (url.includes('/uploads/')) {
    const cleanPath = url.substring(url.indexOf('/uploads/'));
    const subPath = cleanPath.replace(/^\/uploads\//, ''); // e.g. products/file.jpg

    // Try deleting from persistent UPLOAD_DIR first, then local fallback
    const pathsToTry = [
      path.join(UPLOAD_BASE, subPath),
      path.join(LOCAL_UPLOADS, subPath),
    ];

    for (const filePath of pathsToTry) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`[Storage] Deleted local file: ${filePath}`);
          return; // stop after first successful delete
        }
      } catch (err) {
        console.warn(`[Storage] Could not delete "${filePath}":`, err.message);
      }
    }
  }
};

const deleteCloudinaryAssets = async (urls = []) => {
  const filtered = (urls || []).filter(Boolean);
  if (filtered.length === 0) return;
  await Promise.all(filtered.map(deleteCloudinaryAsset));
};

module.exports = { deleteCloudinaryAsset, deleteCloudinaryAssets, extractPublicId };
