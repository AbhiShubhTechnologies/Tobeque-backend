const mongoose = require('mongoose');
require('dotenv').config();

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tobeque_ecommerce';

if (!process.env.MONGO_URI) {
  console.warn('⚠️ MONGO_URI is not set in .env. Falling back to local MongoDB (mongodb://127.0.0.1:27017/tobeque_ecommerce).');
}

const testConnection = async () => {
  try {
    await mongoose.connect(mongoUri);
    console.log('Database Connection has been established successfully (MongoDB).');

    // Remediate legacy email_1 unique index issues
    try {
      const db = mongoose.connection.db;
      if (db) {
        const collections = await db.listCollections({ name: 'users' }).toArray();
        if (collections.length > 0) {
          const indexes = await db.collection('users').indexes();
          const emailIdx = indexes.find(idx => idx.name === 'email_1');
          if (emailIdx) {
            await db.collection('users').dropIndex('email_1');
            console.log('✅ Successfully dropped legacy email_1 index from users collection.');
          }
          // Clean up existing user records where email is empty string "" or null
          await db.collection('users').updateMany(
            { email: { $in: ['', null] } },
            { $unset: { email: '' } }
          );
        }
      }
    } catch (cleanErr) {
      console.warn('Notice: user index cleanup encountered issue (non-fatal):', cleanErr.message);
    }
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
};

module.exports = {
  mongoose,
  testConnection
};
