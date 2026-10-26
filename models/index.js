const { mongoose } = require('../config/db');
const Admin = require('./admin');
const User = require('./user');
const Category = require('./category');
const Brand = require('./brand');
const Product = require('./product');
const ProductImage = require('./productImage');
const Coupon = require('./coupon');
const Order = require('./order');
const OrderItem = require('./orderItem');
const Payment = require('./payment');
const Review = require('./review');
const Banner = require('./banner');
const InventoryLog = require('./inventoryLog');
const AdminLog = require('./adminLog');
const Setting = require('./setting');
const SeasonCollection = require('./seasonCollection');
const FAQ = require('./faq');
const JobApplication = require('./jobApplication');
const Subscriber = require('./subscriber');
const Blog = require('./blog');
const JobPosting = require('./jobPosting');
const CommunityStyle = require('./communityStyle');
const AboutUs = require('./aboutUs');
const AdminNotification = require('./adminNotification');

module.exports = {
  sequelize: mongoose, // Keep database interface name compatible
  mongoose,
  Admin,
  User,
  Category,
  Brand,
  Product,
  ProductImage,
  Coupon,
  Order,
  OrderItem,
  Payment,
  Review,
  Banner,
  InventoryLog,
  AdminLog,
  Setting,
  SeasonCollection,
  FAQ,
  JobApplication,
  Subscriber,
  Blog,
  JobPosting,
  CommunityStyle,
  AboutUs,
  AdminNotification
};
