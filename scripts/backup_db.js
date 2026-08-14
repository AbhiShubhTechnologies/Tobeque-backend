const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  console.error('MONGO_URI is missing in .env');
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(__dirname, '..', '..', 'db_backups', `db_backup_${timestamp}`);

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

async function runBackup() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB Atlas successfully.');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    console.log(`Found ${collections.length} collections to backup.`);
    const summary = {};

    for (const colInfo of collections) {
      const colName = colInfo.name;
      const collection = db.collection(colName);
      const docs = await collection.find({}).toArray();

      const filePath = path.join(backupDir, `${colName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');

      summary[colName] = docs.length;
      console.log(`Backed up collection "${colName}": ${docs.length} documents -> ${colName}.json`);
    }

    const summaryPath = path.join(backupDir, '_backup_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalCollections: collections.length,
      collections: summary
    }, null, 2), 'utf-8');

    console.log('\n=============================================');
    console.log(`DATABASE BACKUP COMPLETED SUCCESSFULLY!`);
    console.log(`Backup saved to: ${backupDir}`);
    console.log('=============================================\n');

  } catch (err) {
    console.error('Backup failed:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

runBackup();
