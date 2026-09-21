const { Coupon, AdminLog } = require('../models');

// @desc    Get All Coupons
// @route   GET /api/coupons
// @access  Private
const getCoupons = async (req, res, next) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      coupons
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create Coupon
// @route   POST /api/coupons
// @access  Private
const createCoupon = async (req, res, next) => {
  try {
    const { code, type, discountValue, minOrderAmount, usageLimit, startDate, expiryDate, status, freeShipping } = req.body;

    const codeUpper = code.toString().toUpperCase().trim();

    const couponExists = await Coupon.findOne({ code: codeUpper });
    if (couponExists) {
      return res.status(400).json({ success: false, error: `Coupon code '${codeUpper}' already exists` });
    }

    const coupon = await Coupon.create({
      code: codeUpper,
      type,
      discountValue: parseFloat(discountValue),
      minOrderAmount: minOrderAmount ? parseFloat(minOrderAmount) : 0.00,
      usageLimit: usageLimit ? parseInt(usageLimit) : 100,
      startDate,
      expiryDate,
      status: status !== undefined ? status : true,
      freeShipping: freeShipping !== undefined ? freeShipping : false
    });

    await AdminLog.create({
      adminId: req.admin.id,
      action: `Created coupon code: ${coupon.code}`,
      entityType: 'coupon',
      entityId: coupon.id,
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      coupon
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update Coupon
// @route   PUT /api/coupons/:id
// @access  Private
const updateCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({ success: false, error: 'Coupon not found' });
    }

    const { code, type, discountValue, minOrderAmount, usageLimit, startDate, expiryDate, status, freeShipping } = req.body;

    if (code) {
      const codeUpper = code.toString().toUpperCase().trim();
      if (codeUpper !== coupon.code) {
        const couponExists = await Coupon.findOne({ code: codeUpper });
        if (couponExists) {
          return res.status(400).json({ success: false, error: `Coupon code '${codeUpper}' already exists` });
        }
        coupon.code = codeUpper;
      }
    }

    coupon.type = type || coupon.type;
    coupon.discountValue = discountValue !== undefined ? parseFloat(discountValue) : coupon.discountValue;
    coupon.minOrderAmount = minOrderAmount !== undefined ? parseFloat(minOrderAmount) : coupon.minOrderAmount;
    coupon.usageLimit = usageLimit !== undefined ? parseInt(usageLimit) : coupon.usageLimit;
    coupon.startDate = startDate || coupon.startDate;
    coupon.expiryDate = expiryDate || coupon.expiryDate;
    coupon.status = status !== undefined ? status : coupon.status;
    coupon.freeShipping = freeShipping !== undefined ? freeShipping : coupon.freeShipping;

    await coupon.save();

    await AdminLog.create({
      adminId: req.admin.id,
      action: `Updated coupon: ${coupon.code}`,
      entityType: 'coupon',
      entityId: coupon.id,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      coupon
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete Coupon
// @route   DELETE /api/coupons/:id
// @access  Private
const deleteCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({ success: false, error: 'Coupon not found' });
    }

    const couponCode = coupon.code;
    const couponId = coupon.id;

    await coupon.deleteOne();

    await AdminLog.create({
      adminId: req.admin.id,
      action: `Deleted coupon: ${couponCode}`,
      entityType: 'coupon',
      entityId: couponId,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Coupon code deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon
};
