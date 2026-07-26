const mongoose = require('mongoose');

const ContactSubmissionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, trim: true, default: '' },
  subject: { type: String, trim: true, default: '' },
  message: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['new', 'read', 'replied'],
    default: 'new'
  }
}, { timestamps: true });

const ContactSettingsSchema = new mongoose.Schema({
  phone: { type: String, default: '+91 84470 00200' },
  whatsapp: { type: String, default: '+918447000200' },
  email: { type: String, default: 'care@tobeque.com' },
  officeAddress: { type: String, default: 'Tobeque Fashion Pvt. Ltd.\n123, Fashion Street, Sector 18,\nNoida, Uttar Pradesh – 201301\nIndia' },
  businessHours: {
    type: String,
    default: 'Mon–Fri: 10:00 AM – 7:00 PM\nSaturday: 10:00 AM – 5:00 PM\nSunday: Closed'
  },
  mapEmbedUrl: {
    type: String,
    default: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3502.3395609786165!2d77.32498177504598!3d28.62700818567088!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x390ce5a0b62879d5%3A0x92b1ceebb527c82e!2sSector%2018%2C%20Noida%2C%20Uttar%20Pradesh!5e0!3m2!1sen!2sin!4v1706260000000!5m2!1sen!2sin'
  },
  mapAddress: { type: String, default: 'Sector 18, Noida, Uttar Pradesh' }
}, { timestamps: true });

const ContactSubmission = mongoose.model('ContactSubmission', ContactSubmissionSchema);
const ContactSettings = mongoose.model('ContactSettings', ContactSettingsSchema);

module.exports = { ContactSubmission, ContactSettings };
