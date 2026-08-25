const { Setting, AdminLog } = require('../models');
const shiprocket = require('../utils/shiprocket');

// @desc    Get All System Settings
// @route   GET /api/settings
// @access  Private
const getSettings = async (req, res, next) => {
  try {
    const settingsList = await Setting.find();
    
    // Convert array of key-value records into a flat JSON object!
    const settings = {};
    settingsList.forEach(setting => {
      settings[setting.key] = setting.value;
    });

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update Site Settings
// @route   POST /api/settings
// @access  Private
const updateSettings = async (req, res, next) => {
  try {
    const settingsPayload = req.body; // e.g. { site_name: "Tobeque Core", currency: "USD" }

    // Upload new logo if provided
    if (req.file) {
      settingsPayload['site_logo'] = req.file.path;
    }

    const updatePromises = Object.keys(settingsPayload).map(async (key) => {
      const val = settingsPayload[key] !== null ? settingsPayload[key].toString() : '';
      return await Setting.findOneAndUpdate({ key }, { value: val }, { upsert: true, new: true });
    });

    await Promise.all(updatePromises);

    // Reset Shiprocket in-memory auth token cache & cooloff so new credentials take effect immediately
    try {
      shiprocket.clearShiprocketTokenCache();
    } catch (e) {
      console.warn('[Settings] Failed to clear Shiprocket token cache:', e.message);
    }

    await AdminLog.create({
      adminId: req.admin.id,
      action: 'Updated global site parameters and SMTP/integrations configurations',
      entityType: 'settings',
      ipAddress: req.ip
    });

    // Re-fetch flat settings
    const settingsList = await Setting.find();
    const settings = {};
    settingsList.forEach(s => {
      settings[s.key] = s.value;
    });

    res.json({
      success: true,
      message: 'Global settings updated successfully',
      settings
    });
  } catch (error) {
    next(error);
  }
};

const getPublicSettings = async (req, res, next) => {
  try {
    const settingsList = await Setting.find({
      key: { $in: [
        'storeName', 'storeCurrency', 'deliveryEstimateMin', 'deliveryEstimateMax',
        'shippingFallbackRate', 'freeShippingThreshold', 'codFee', 'shippingReturnsText'
      ]}
    });
    
    const settings = {};
    settingsList.forEach(setting => {
      settings[setting.key] = setting.value;
    });

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateSettings,
  getPublicSettings
};
