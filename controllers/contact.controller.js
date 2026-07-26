const { ContactSubmission, ContactSettings } = require('../models/contact');
const { AdminLog } = require('../models');

// ─── CONTACT SUBMISSIONS ──────────────────────────────────────────────────────

// @desc   Submit contact form (Public)
// @route  POST /api/contact/submit
exports.submitContactForm = async (req, res, next) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: 'Name, email, and message are required.' });
    }
    const submission = await ContactSubmission.create({ name, email, phone, subject, message });
    res.status(201).json({ success: true, message: 'Your message has been received. We\'ll get back to you soon!', data: submission });
  } catch (error) {
    next(error);
  }
};

// @desc   Get all contact form submissions (Admin)
// @route  GET /api/contact/submissions
exports.getSubmissions = async (req, res, next) => {
  try {
    const submissions = await ContactSubmission.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: submissions.length, data: submissions });
  } catch (error) {
    next(error);
  }
};

// @desc   Update submission status (Admin)
// @route  PUT /api/contact/submissions/:id/status
exports.updateSubmissionStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const submission = await ContactSubmission.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!submission) return res.status(404).json({ success: false, error: 'Submission not found' });
    res.status(200).json({ success: true, data: submission });
  } catch (error) {
    next(error);
  }
};

// @desc   Delete a submission (Admin)
// @route  DELETE /api/contact/submissions/:id
exports.deleteSubmission = async (req, res, next) => {
  try {
    const submission = await ContactSubmission.findByIdAndDelete(req.params.id);
    if (!submission) return res.status(404).json({ success: false, error: 'Submission not found' });
    res.status(200).json({ success: true, message: 'Submission deleted.' });
  } catch (error) {
    next(error);
  }
};

// ─── CONTACT SETTINGS (CMS) ───────────────────────────────────────────────────

// @desc   Get contact page settings (Public)
// @route  GET /api/contact/settings
exports.getContactSettings = async (req, res, next) => {
  try {
    let settings = await ContactSettings.findOne();
    if (!settings) {
      settings = await ContactSettings.create({});
    }
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};

// @desc   Update contact page settings (Admin)
// @route  PUT /api/contact/settings
exports.updateContactSettings = async (req, res, next) => {
  try {
    let settings = await ContactSettings.findOne();
    if (!settings) {
      settings = await ContactSettings.create(req.body);
    } else {
      settings = await ContactSettings.findByIdAndUpdate(settings._id, req.body, {
        new: true,
        runValidators: true
      });
    }

    if (req.admin) {
      await AdminLog.create({
        adminId: req.admin.id,
        action: 'Updated Contact Us settings',
        entityType: 'contactSettings',
        entityId: settings._id,
        ipAddress: req.ip
      });
    }

    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};
