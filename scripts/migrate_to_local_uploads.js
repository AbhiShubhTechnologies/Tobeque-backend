const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI;
const domainUrl = (process.env.BACKEND_URL || 'https://backend.tobeque.com').replace(/\/+$/, '');

const sourceDir = path.join(__dirname, '..', '..', 'downloaded_images');
const backendUploadsBase = path.join(__dirname, '..', 'uploads');
const manifestPath = path.join(sourceDir, 'image_migration_manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error('Migration manifest not found at:', manifestPath);
  process.exit(1);
}

// Ensure all target upload subfolders exist
const subfolders = ['products', 'categories', 'banners', 'season', 'site', 'users', 'misc', 'refunds', 'blogs'];
subfolders.forEach(sub => {
  const dir = path.join(backendUploadsBase, sub);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

function getTargetSubfolder(dbReferences = []) {
  if (!dbReferences || dbReferences.length === 0) return 'products';
  const firstRef = dbReferences[0];
  const col = (firstRef.collection || '').toLowerCase();

  if (col === 'products' || col === 'productimages') return 'products';
  if (col === 'categories') return 'categories';
  if (col === 'banners') return 'banners';
  if (col === 'seasoncollections') return 'season';
  if (col === 'aboutus' || col === 'settings' || col === 'contactsettings') return 'site';
  if (col === 'users') return 'users';
  if (col === 'refundrequests') return 'refunds';
  if (col === 'blogs') return 'blogs';
  return 'misc';
}

async function migrateAllSections() {
  console.log('=================================================================');
  console.log(`Starting Domain Migration: Target Domain = ${domainUrl}`);
  console.log('=================================================================\n');

  // Step 1: Sort & Copy Images
  console.log('--- Step 1: Organizing Images into backend/uploads/ ---');
  let copyCount = 0;
  const fileSubfolderMap = new Map();

  for (const item of manifest) {
    if (item.localPath && fs.existsSync(item.localPath) && item.fileSizeBytes > 0) {
      const subfolder = getTargetSubfolder(item.dbReferences);
      fileSubfolderMap.set(item.index, subfolder);

      const targetDir = path.join(backendUploadsBase, subfolder);
      const destPath = path.join(targetDir, item.localFileName);

      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(item.localPath, destPath);
        copyCount++;
      }
    }
  }
  console.log(`Copied/Organized ${copyCount} files.`);

  // Step 2: Update Database Records to absolute Backend Domain URLs
  console.log('\n--- Step 2: Updating MongoDB Documents with Domain URLs ---');
  if (!mongoUri) {
    console.error('MONGO_URI missing in .env');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB Atlas.');
  const db = mongoose.connection.db;

  let totalUpdatedDocs = 0;
  const statsByCollection = {};

  for (const item of manifest) {
    if (!item.localFileName) continue;
    const subfolder = fileSubfolderMap.get(item.index) || getTargetSubfolder(item.dbReferences);
    
    // Construct full working URL using Backend Domain
    const newDomainUrl = `${domainUrl}/uploads/${subfolder}/${item.localFileName}`;

    if (!item.dbReferences || item.dbReferences.length === 0) continue;

    for (const ref of item.dbReferences) {
      const collection = db.collection(ref.collection);
      const fieldPath = ref.field;
      const docIdStr = ref.docId;

      if (!docIdStr || !fieldPath) continue;

      let filter = {};
      try {
        filter = { _id: new mongoose.Types.ObjectId(docIdStr) };
      } catch (e) {
        filter = { _id: docIdStr };
      }

      const updateQuery = { $set: { [fieldPath]: newDomainUrl } };

      const result = await collection.updateOne(filter, updateQuery);
      if (result.modifiedCount > 0) {
        totalUpdatedDocs++;
        statsByCollection[ref.collection] = (statsByCollection[ref.collection] || 0) + 1;
      }
    }
  }

  console.log('\n=================================================================');
  console.log('DOMAIN URL MIGRATION COMPLETED SUCCESSFULLY!');
  console.log('=================================================================');
  console.log(`Target Domain: ${domainUrl}`);
  console.log(`Total Database Records Updated: ${totalUpdatedDocs}`);
  console.log('\nUpdated records per section:');
  console.table(statsByCollection);
  console.log('=================================================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

migrateAllSections().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
