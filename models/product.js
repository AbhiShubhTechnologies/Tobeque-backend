const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  slug: {
    type: String,
    required: true,
    unique: true
  },
  sku: {
    type: String,
    required: true,
    unique: true
  },
  barcode: {
    type: String
  },
  shortDescription: {
    type: String
  },
  fullDescription: {
    type: String
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  additionalCategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    default: null
  },
  price: {
    type: Number,
    required: true,
    default: 0.00
  },
  discountPrice: {
    type: Number,
    default: null
  },
  taxRate: {
    type: Number,
    required: true,
    default: 0.00
  },
  stockQuantity: {
    type: Number,
    required: true,
    default: 0
  },
  weight: {
    type: Number,
    default: null
  },
  dimensions: {
    type: String
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft'
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  isOnSaleSection: {
    type: Boolean,
    default: false
  },
  isHotRightNow: {
    type: Boolean,
    default: false
  },
  hotRightNowMedia: {
    type: String
  },
  thumbnail: {
    type: String
  },
  colors: [{
    type: String
  }],
  variants: {
    type: mongoose.Schema.Types.Mixed
  },
  seoTitle: {
    type: String
  },
  seoDescription: {
    type: String
  },
  seoKeywords: {
    type: String,
    default: ''
  },
  seoSchema: {
    type: String,
    default: ''
  },
  countdownEvergreen: {
    type: Boolean,
    default: false
  },
  restartCountdownAfter: {
    type: Number
  },
  countdownTimerProfile: {
    type: String
  },
  enableProgressBar: {
    type: Boolean,
    default: false
  },
  whenAchievingGoal: {
    type: String
  },
  goal: {
    type: Number
  },
  initialQuantity: {
    type: Number
  },
  taxStatus: {
    type: String
  },
  taxClass: {
    type: String
  },
  hsnSacCode: {
    type: String
  },
  whatsAppNumber: {
    type: String
  },
  callToAction: {
    type: String
  },
  preFilledMessage: {
    type: String
  },
  displaySettings: {
    type: String
  },
  styleItWith: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  show7DayReturn: {
    type: Boolean,
    default: true
  },
  showFreeShipping: {
    type: Boolean,
    default: true
  },
  showCodAvailable: {
    type: Boolean,
    default: true
  },
  sizeChart: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
      ret.id = ret._id ? ret._id.toString() : ret.id;
      delete ret._id;
    }
  },
  toObject: {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
      ret.id = ret._id ? ret._id.toString() : ret.id;
      delete ret._id;
    }
  }
});

// Virtual for images
ProductSchema.virtual('images', {
  ref: 'ProductImage',
  localField: '_id',
  foreignField: 'product'
});

// Virtual for reviews
ProductSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'product'
});

// Indexes for performance
ProductSchema.index({ status: 1 });
ProductSchema.index({ isFeatured: 1 });
ProductSchema.index({ isOnSaleSection: 1 });
ProductSchema.index({ isHotRightNow: 1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ additionalCategories: 1 });

module.exports = mongoose.model('Product', ProductSchema);
