const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const outputDir = path.join(__dirname, '..', '..', 'downloaded_images');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Download helper with redirect support
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP Status ${response.statusCode}`));
      }

      const fileStream = fs.createWriteStream(destPath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => {
          try {
            const stats = fs.statSync(destPath);
            resolve(stats.size);
          } catch (e) {
            resolve(0);
          }
        });
      });

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    request.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

function sanitizeFilename(str) {
  return str.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function runDownloadProcess() {
  console.log('Starting Fast Parallel Cloudinary & Database Image Downloader...');
  const imageMap = new Map();

  // Step 1: Fetch all resources directly from Cloudinary API
  console.log('\n--- Step 1: Fetching Cloudinary API Assets ---');
  try {
    let nextCursor = null;
    let totalCloudinaryAssets = 0;

    do {
      const options = { max_results: 500, resource_type: 'image' };
      if (nextCursor) options.next_cursor = nextCursor;

      const res = await cloudinary.api.resources(options);
      for (const resource of res.resources) {
        totalCloudinaryAssets++;
        const secureUrl = resource.secure_url || resource.url;
        imageMap.set(secureUrl, {
          url: secureUrl,
          publicId: resource.public_id,
          format: resource.format,
          bytes: resource.bytes,
          source: 'cloudinary_api',
          dbReferences: []
        });
      }
      nextCursor = res.next_cursor;
    } while (nextCursor);

    console.log(`Fetched ${totalCloudinaryAssets} images directly from Cloudinary API.`);
  } catch (err) {
    console.warn('Notice: Could not fetch Cloudinary API resources directly:', err.message);
  }

  // Step 2: Fetch image URLs from MongoDB Database
  console.log('\n--- Step 2: Extracting Image URLs from Database Collections ---');
  if (mongoUri) {
    try {
      await mongoose.connect(mongoUri);
      console.log('Connected to MongoDB Atlas.');

      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();

      for (const colInfo of collections) {
        const colName = colInfo.name;
        const docs = await db.collection(colName).find({}).toArray();

        for (const doc of docs) {
          const docId = doc._id ? doc._id.toString() : '';

          const findUrlsInObject = (obj, pathPrefix = '') => {
            if (!obj) return;
            if (typeof obj === 'string') {
              if (obj.startsWith('http://') || obj.startsWith('https://') || obj.includes('/upload/') || obj.includes('cloudinary')) {
                const url = obj.trim();
                if (!imageMap.has(url)) {
                  imageMap.set(url, {
                    url: url,
                    publicId: null,
                    source: 'database',
                    dbReferences: []
                  });
                }
                const record = imageMap.get(url);
                record.dbReferences.push({ collection: colName, docId, field: pathPrefix });
              }
            } else if (Array.isArray(obj)) {
              obj.forEach((item, idx) => findUrlsInObject(item, `${pathPrefix}[${idx}]`));
            } else if (typeof obj === 'object') {
              for (const [key, val] of Object.entries(obj)) {
                findUrlsInObject(val, pathPrefix ? `${pathPrefix}.${key}` : key);
              }
            }
          };

          findUrlsInObject(doc);
        }
      }
      console.log(`Scan completed across DB collections. Found ${imageMap.size} total unique image URLs.`);
    } catch (err) {
      console.error('Error scanning MongoDB collections:', err.message);
    } finally {
      await mongoose.disconnect();
    }
  }

  // Step 3: Fast Parallel Downloads (Batch Size 25)
  console.log('\n--- Step 3: Downloading Images to Local Directory (Parallel Batches of 25) ---');
  const items = Array.from(imageMap.entries());
  const BATCH_SIZE = 25;
  const manifest = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async ([url, meta], batchIdx) => {
      const globalIdx = i + batchIdx + 1;
      let filename = '';
      if (meta.publicId) {
        filename = sanitizeFilename(meta.publicId) + (meta.format ? `.${meta.format}` : '.jpg');
      } else {
        const urlParts = url.split('?')[0].split('/');
        const rawName = urlParts[urlParts.length - 1] || `image_${globalIdx}.jpg`;
        filename = `${globalIdx}_${sanitizeFilename(rawName)}`;
      }

      const destPath = path.join(outputDir, filename);

      try {
        const downloadedBytes = await downloadFile(url, destPath);
        successCount++;
        return {
          index: globalIdx,
          originalUrl: url,
          localFileName: filename,
          localPath: destPath,
          fileSizeBytes: downloadedBytes,
          publicId: meta.publicId || null,
          source: meta.source,
          dbReferences: meta.dbReferences
        };
      } catch (err) {
        failCount++;
        return {
          index: globalIdx,
          originalUrl: url,
          error: err.message,
          source: meta.source,
          dbReferences: meta.dbReferences
        };
      }
    });

    const results = await Promise.all(promises);
    manifest.push(...results);

    console.log(`Downloaded batch [${Math.min(i + BATCH_SIZE, items.length)}/${items.length}] images...`);
  }

  // Write manifest file
  const manifestPath = path.join(outputDir, 'image_migration_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log('\n=============================================');
  console.log(`IMAGE DOWNLOAD COMPLETE!`);
  console.log(`Total Found: ${imageMap.size}`);
  console.log(`Successfully Downloaded: ${successCount}`);
  console.log(`Failed Downloads: ${failCount}`);
  console.log(`Downloaded Files Location: ${outputDir}`);
  console.log(`Manifest File: ${manifestPath}`);
  console.log('=============================================\n');

  process.exit(0);
}

runDownloadProcess();
