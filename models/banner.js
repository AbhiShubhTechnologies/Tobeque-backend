const mongoose = require('mongoose');

const BannerSchema = new mongoose.Schema({
  title: {
    type: String
  },
  subtitle: {
    type: String
  },
  imageUrl: {
    type: String
  },
  mobileImageUrl: {
    type: String
  },
  linkUrl: {
    type: String
  },
  bannerLink: {
    type: String
  },
  position: {
    type: String,
    enum: ['home_slider', 'promo_top', 'promo_bottom', 'mobile_app', 'promo_banner', 'mobile_banner', 'collection_hero'],
    default: 'home_slider'
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  status: {
    type: Boolean,
    default: true
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

module.exports = mongoose.model('Banner', BannerSchema);
