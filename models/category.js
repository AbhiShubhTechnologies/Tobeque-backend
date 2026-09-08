const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  slug: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String
  },
  descriptionSections: [{
    title: { type: String, default: '' },
    content: { type: String, default: '' }
  }],
  image: {
    type: String
  },
  banner: {
    type: String
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
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
  twitterTitle: {
    type: String,
    default: ''
  },
  twitterDescription: {
    type: String,
    default: ''
  },
  twitterImage: {
    type: String,
    default: ''
  },
  twitterCard: {
    type: String,
    default: 'summary_large_image'
  },
  ogTitle: {
    type: String,
    default: ''
  },
  ogDescription: {
    type: String,
    default: ''
  },
  ogImage: {
    type: String,
    default: ''
  },
  ogType: {
    type: String,
    default: 'website'
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

// Virtual for subcategories (self-referential)
CategorySchema.virtual('subcategories', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parentId'
});

module.exports = mongoose.model('Category', CategorySchema);
