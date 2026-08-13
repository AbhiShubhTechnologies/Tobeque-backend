const mongoose = require('mongoose');

const AboutUsSchema = new mongoose.Schema({
  // Since there's only one About Us page, we can just fetch the first document
  heroTitle: {
    type: String,
    default: 'About Tobeque'
  },
  heroSubtitle: {
    type: String,
    default: 'We are passionate about fashion.'
  },
  missionStatement: {
    type: String,
    default: 'Our mission is to bring you the best styles.'
  },
  missionImage: {
    type: String,
    default: ''
  },
  visionStatement: {
    type: String,
    default: 'To be the leading fashion destination for youth.'
  },
  ourStoryTitle: {
    type: String,
    default: 'Our Story'
  },
  ourStoryText: {
    type: String,
    default: 'Founded with a love for street style, Tobeque has grown into a community.'
  },
  ourStoryText2: {
    type: String,
    default: ''
  },
  extraSections: [{
    title: {
      type: String,
      default: ''
    },
    description: {
      type: String,
      default: ''
    }
  }],
  stats: [{
    label: String,
    value: String
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('AboutUs', AboutUsSchema);
