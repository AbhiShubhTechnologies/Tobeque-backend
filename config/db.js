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
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
};

module.exports = {
  mongoose,
  testConnection
};
