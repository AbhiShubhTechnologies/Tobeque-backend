const { Banner, AdminLog } = require('../models');
const { deleteCloudinaryAsset } = require('../utils/cloudinary');

// @desc    Get List of Banners
// @route   GET /api/banners
// @access  Private
const getBanners = async (req, res, next) => {
  try {
    const banners = await Banner.find().sort({ sortOrder: 1 });
    res.json({
      success: true,
      banners
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create Banner
// @route   POST /api/banners
// @access  Private
const createBanner = async (req, res, next) => {
  try {
    const { title, subtitle, linkUrl, bannerLink, position, sortOrder, status } = req.body;

    let imageUrl = '';
    if (req.file) {
      imageUrl = req.file.path;
    } else {
      return res.status(400).json({ success: false, error: 'Please upload a banner image file' });
    }

    const banner = await Banner.create({
      title,
      subtitle,
      imageUrl,
      linkUrl: linkUrl || '',
      bannerLink: bannerLink || '',
      position: position || 'home_slider',
      sortOrder: sortOrder ? parseInt(sortOrder) : 0,
      status: status !== undefined ? status : true
    });

    await AdminLog.create({
      adminId: req.admin.id,
      action: `Created new banner: ${banner.title || 'Untitled'}`,
      entityType: 'banner',
      entityId: banner.id,
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      banner
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update Banner
// @route   PUT /api/banners/:id
// @access  Private
const updateBanner = async (req, res, next) => {
  try {
    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      return res.status(404).json({ success: false, error: 'Banner not found' });
    }

    const { title, subtitle, linkUrl, bannerLink, position, sortOrder, status } = req.body;

    banner.title = title !== undefined ? title : banner.title;
    banner.subtitle = subtitle !== undefined ? subtitle : banner.subtitle;
    banner.linkUrl = linkUrl !== undefined ? linkUrl : banner.linkUrl;
    banner.bannerLink = bannerLink !== undefined ? bannerLink : banner.bannerLink;
    banner.position = position || banner.position;
    banner.sortOrder = sortOrder ? parseInt(sortOrder) : banner.sortOrder;
    banner.status = status !== undefined ? status : banner.status;

    if (req.file) {
      // Delete old image from Cloudinary before replacing
      if (banner.imageUrl) {
        await deleteCloudinaryAsset(banner.imageUrl);
      }
      banner.imageUrl = req.file.path;
    }

    await banner.save();

    await AdminLog.create({
      adminId: req.admin.id,
      action: `Updated banner: ${banner.title || 'Untitled'}`,
      entityType: 'banner',
      entityId: banner.id,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      banner
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete Banner
// @route   DELETE /api/banners/:id
// @access  Private
const deleteBanner = async (req, res, next) => {
  try {
    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      return res.status(404).json({ success: false, error: 'Banner not found' });
    }

    const bannerTitle = banner.title || 'Untitled';
    const bannerId = banner.id;
    const bannerImageUrl = banner.imageUrl;

    await banner.deleteOne();

    // Clean up image from Cloudinary
    if (bannerImageUrl) {
      await deleteCloudinaryAsset(bannerImageUrl);
    }

    await AdminLog.create({
      adminId: req.admin.id,
      action: `Deleted banner: ${bannerTitle}`,
      entityType: 'banner',
      entityId: bannerId,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Banner image deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBanners,
  createBanner,
  updateBanner,
  deleteBanner
};
