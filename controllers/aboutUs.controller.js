const AboutUs = require('../models/aboutUs');
const { AdminLog } = require('../models');

// @desc    Get About Us content
// @route   GET /api/about-us
// @access  Public
exports.getAboutUs = async (req, res, next) => {
  try {
    let aboutUs = await AboutUs.findOne();
    if (!aboutUs) {
      // Create default if it doesn't exist
      aboutUs = await AboutUs.create({
        stats: [
          { label: 'Happy Customers', value: '10K+' },
          { label: 'Products', value: '500+' }
        ]
      });
    }
    res.status(200).json({ success: true, data: aboutUs });
  } catch (error) {
    next(error);
  }
};

// @desc    Update About Us content
// @route   PUT /api/about-us
// @access  Private (Admin)
exports.updateAboutUs = async (req, res, next) => {
  try {
    if (req.file) {
      req.body.missionImage = req.file.path;
    }

    // Parse stats if sent as string (from FormData)
    if (req.body.stats && typeof req.body.stats === 'string') {
      try {
        req.body.stats = JSON.parse(req.body.stats);
      } catch (err) {
        req.body.stats = [];
      }
    }

    // Parse extraSections if sent as string (from FormData)
    if (req.body.extraSections && typeof req.body.extraSections === 'string') {
      try {
        req.body.extraSections = JSON.parse(req.body.extraSections);
      } catch (err) {
        req.body.extraSections = [];
      }
    }

    let aboutUs = await AboutUs.findOne();
    if (!aboutUs) {
      aboutUs = await AboutUs.create(req.body);
    } else {
      aboutUs = await AboutUs.findByIdAndUpdate(aboutUs._id, req.body, {
        new: true,
        runValidators: true
      });
    }

    if (req.admin) {
      await AdminLog.create({
        adminId: req.admin.id,
        action: 'Updated About Us content',
        entityType: 'aboutUs',
        entityId: aboutUs.id,
        ipAddress: req.ip
      });
    }

    res.status(200).json({ success: true, data: aboutUs });
  } catch (error) {
    next(error);
  }
};
