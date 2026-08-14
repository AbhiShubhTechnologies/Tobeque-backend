const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const extractPublicId = (url) => {
  if (!url || typeof url !== 'string') return null;
  if (!url.includes('cloudinary.com')) return null;

  try {
    const cleanUrl = url.split('?')[0];
    const match = cleanUrl.match(/\/upload\/(?:v\d+\/)?(.+)$/);
    if (!match) return null;

    const withExt = match[1];
    const publicId = withExt.replace(/\.[^/.]+$/, '');
    return publicId;
  } catch {
    return null;
  }
};

const deleteCloudinaryAsset = async (url) => {
  if (!url || typeof url !== 'string') return;

  // 1. Handle local file deletion if path starts with /uploads/ or contains /uploads/
  if (url.includes('/uploads/')) {
    try {
      const cleanPath = url.substring(url.indexOf('/uploads/'));
      const localFilePath = path.join(__dirname, '..', cleanPath);
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
        console.log(`[Storage] Deleted local file: ${localFilePath}`);
      }
    } catch (err) {
      console.warn(`[Storage] Could not delete local file "${url}":`, err.message);
    }
    return;
  }

  // 2. Handle Cloudinary asset deletion if URL is Cloudinary
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
};

const deleteCloudinaryAssets = async (urls = []) => {
  const filtered = (urls || []).filter(Boolean);
  if (filtered.length === 0) return;
  await Promise.all(filtered.map(deleteCloudinaryAsset));
};

module.exports = { deleteCloudinaryAsset, deleteCloudinaryAssets, extractPublicId };
