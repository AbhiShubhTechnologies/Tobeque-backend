const jwt = require('jsonwebtoken');
const { User, Order, OrderItem, Product, Coupon } = require('../models');
const { sendOrderConfirmationEmail } = require('../utils/emailService');
const { sendOtpViaSMS } = require('../utils/smsService');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Development fallback OTP if Fast2SMS key is missing
const DEV_OTP = '123456';
const OTP_EXPIRY_MINUTES = 30;

const generateUserToken = (id) => {
  return jwt.sign(
    { id, type: 'user' },
    process.env.JWT_SECRET || 'supersecretjwtsecretkeyshouldbecomplex39284',
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// @desc    Send OTP to mobile number
// @route   POST /api/user-auth/send-otp
// @access  Public
const sendOtp = async (req, res, next) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    // Normalize phone: remove spaces/dashes, ensure no leading zeros issue
    const normalizedPhone = String(phone).replace(/\s+/g, '').replace(/-/g, '');

    // Generate random 6-digit OTP or fallback to DEV_OTP if no Fast2SMS key
    const generatedOtp = process.env.FAST2SMS_API_KEY
      ? Math.floor(100000 + Math.random() * 900000).toString()
      : DEV_OTP;

    // Find or create user by phone
    let user = await User.findOne({ phone: normalizedPhone });

    if (!user) {
      user = await User.create({
        phone: normalizedPhone,
        firstName: 'Guest',
        lastName: 'User',
        email: `${normalizedPhone}@guest.local`,
        password: generatedOtp,
        status: 'active'
      });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({ success: false, error: 'This account has been blocked. Please contact support.' });
    }

    // Set OTP and expiry
    const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    user.otpCode = generatedOtp;
    user.otpExpiry = expiry;
    await user.save();

    // Send SMS via Fast2SMS
    await sendOtpViaSMS(normalizedPhone, generatedOtp);

    res.json({
      success: true,
      message: `OTP sent to ${normalizedPhone}`
    });
  } catch (error) {
    next(error);
  }
};


// @desc    Verify OTP and log in user
// @route   POST /api/user-auth/verify-otp
// @access  Public
const verifyOtp = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, error: 'Phone number and OTP are required' });
    }

    const normalizedPhone = String(phone).replace(/\s+/g, '').replace(/-/g, '');

    const user = await User.findOne({ phone: normalizedPhone });

    if (!user) {
      return res.status(404).json({ success: false, error: 'No account found for this phone number. Please request an OTP first.' });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({ success: false, error: 'This account has been blocked.' });
    }

    // Validate OTP
    if (!user.otpCode || user.otpCode !== String(otp)) {
      return res.status(401).json({ success: false, error: 'Invalid OTP. Please try again.' });
    }

    // Check expiry
    if (!user.otpExpiry || new Date() > new Date(user.otpExpiry)) {
      return res.status(401).json({ success: false, error: 'OTP has expired. Please request a new one.' });
    }

    // Clear OTP after successful use
    user.otpCode = null;
    user.otpExpiry = null;
    await user.save();

    const token = generateUserToken(user.id);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        status: user.status,
        address: user.address,
        city: user.city,
        state: user.state,
        zipCode: user.zipCode,
        gender: user.gender,
        shippingAddress: user.shippingAddress,
        shippingCity: user.shippingCity,
        shippingState: user.shippingState,
        shippingZipCode: user.shippingZipCode,
        profilePhoto: user.profilePhoto
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Validate a coupon code
// @route   POST /api/user-auth/validate-coupon
// @access  Public
const validateCoupon = async (req, res, next) => {
  try {
    const { code, cartTotal } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, error: 'Coupon code is required' });
    }

    const codeUpper = code.toString().toUpperCase().trim();
    const coupon = await Coupon.findOne({ code: codeUpper });

    if (!coupon) {
      return res.status(404).json({ success: false, error: 'Invalid coupon code' });
    }

    if (!coupon.status) {
      return res.status(400).json({ success: false, error: 'This coupon is no longer active' });
    }

    const now = new Date();
    if (coupon.startDate && new Date(coupon.startDate) > now) {
      return res.status(400).json({ success: false, error: 'This coupon is not active yet' });
    }

    if (coupon.expiryDate && new Date(coupon.expiryDate) < now) {
      return res.status(400).json({ success: false, error: 'This coupon has expired' });
    }

    if (coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, error: 'This coupon has reached its usage limit' });
    }

    if (cartTotal && parseFloat(cartTotal) < parseFloat(coupon.minOrderAmount)) {
      return res.status(400).json({ success: false, error: `Minimum order amount of ₹${coupon.minOrderAmount} required` });
    }

    res.json({
      success: true,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        discountValue: coupon.discountValue,
        minOrderAmount: coupon.minOrderAmount
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get logged-in user's profile
// @route   GET /api/user-auth/profile
// @access  Private (user)
const getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password -otpCode -otpExpiry');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

// @desc    Get logged-in user's order history
// @route   GET /api/user-auth/orders
// @access  Private (user)
const getUserOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .sort('-createdAt')
      .populate({
        path: 'items',
        populate: {
          path: 'product',
          select: 'name thumbnail'
        }
      });

    res.json({ success: true, orders });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile details (name, email, address, sizes)
// @route   PUT /api/user-auth/profile
// @access  Private (user)
const updateUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (req.body.firstName !== undefined) user.firstName = req.body.firstName;
    if (req.body.lastName !== undefined) user.lastName = req.body.lastName;
    if (req.body.email !== undefined) user.email = req.body.email;
    if (req.body.address !== undefined) user.address = req.body.address;
    if (req.body.city !== undefined) user.city = req.body.city;
    if (req.body.state !== undefined) user.state = req.body.state;
    if (req.body.zipCode !== undefined) user.zipCode = req.body.zipCode;
    if (req.body.gender !== undefined) user.gender = req.body.gender;
    
    if (req.body.shippingAddress !== undefined) user.shippingAddress = req.body.shippingAddress;
    if (req.body.shippingCity !== undefined) user.shippingCity = req.body.shippingCity;
    if (req.body.shippingState !== undefined) user.shippingState = req.body.shippingState;
    if (req.body.shippingZipCode !== undefined) user.shippingZipCode = req.body.shippingZipCode;

    await user.save();

    res.json({
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        status: user.status,
        address: user.address,
        city: user.city,
        state: user.state,
        zipCode: user.zipCode,
        gender: user.gender,
        shippingAddress: user.shippingAddress,
        shippingCity: user.shippingCity,
        shippingState: user.shippingState,
        shippingZipCode: user.shippingZipCode,
        profilePhoto: user.profilePhoto
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Place a new order
// @route   POST /api/user-auth/orders
// @access  Private (user)
const createOrder = async (req, res, next) => {
  try {
    const { shippingAddress, billingAddress, items, customerName, customerPhone, couponCode, paymentMethod, notes, shippingCost: clientShippingCost } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'No items in order' });
    }

    // Generate unique order number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `ORD-${dateStr}-${randomStr}`;

    let subtotal = 0;
    let totalTaxAmount = 0;

    // Process items and check stock
    const processedItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ success: false, error: `Product not found for ID ${item.productId}` });
      }
      
      const price = parseFloat(item.price);
      subtotal += price * item.quantity;
      const taxRate = product.taxRate || 0;
      const lineTotal = price * item.quantity;
      const basePrice = lineTotal / (1 + (taxRate / 100));
      const gst = lineTotal - basePrice;
      totalTaxAmount += gst;
      
      processedItems.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        price: price,
        quantity: item.quantity,
        variantDetails: item.variantDetails || null,
        taxRate: taxRate,
        taxAmount: gst
      });
    }

    let discountAmount = 0;
    let appliedCouponCode = null;

    if (couponCode) {
      const codeUpper = couponCode.toString().toUpperCase().trim();
      const coupon = await Coupon.findOne({ code: codeUpper, status: true });
      
      if (coupon) {
        const now = new Date();
        const isStarted = !coupon.startDate || new Date(coupon.startDate) <= now;
        const isNotExpired = !coupon.expiryDate || new Date(coupon.expiryDate) >= now;
        const hasUsageLeft = coupon.usedCount < coupon.usageLimit;
        const meetsMinOrder = subtotal >= parseFloat(coupon.minOrderAmount);

        if (isStarted && isNotExpired && hasUsageLeft && meetsMinOrder) {
          appliedCouponCode = coupon.code;
          if (coupon.type === 'percentage') {
            discountAmount = (subtotal * parseFloat(coupon.discountValue)) / 100;
          } else {
            discountAmount = parseFloat(coupon.discountValue);
          }
          // Cap discount at subtotal
          if (discountAmount > subtotal) discountAmount = subtotal;
          
          // Increment usage count
          coupon.usedCount += 1;
          await coupon.save();
        }
      }
    }

    // Reduce total tax if discount applies proportionally
    const discountRatio = subtotal > 0 ? (discountAmount / subtotal) : 0;
    const finalTaxAmount = totalTaxAmount * (1 - discountRatio);

    // Accept shipping cost from frontend (already verified by Shiprocket or fallback rate)
    const shippingCost = parseFloat(clientShippingCost) || 0;
    const totalAmount = subtotal - discountAmount + shippingCost;

    // Format address object to match Admin OrderDetail.jsx expectation
    const finalAddress = typeof shippingAddress === 'object' ? shippingAddress : {
      name: customerName || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Customer',
      phone: customerPhone || req.user.phone || '',
      street: shippingAddress || req.user.address || 'N/A',
      city: req.user.city || '',
      state: req.user.state || '',
      zip: req.user.zipCode || '',
      country: 'India'
    };

    const addressString = JSON.stringify(finalAddress);
    
    const finalBillingAddress = typeof billingAddress === 'object' ? billingAddress : finalAddress;
    const billingAddressString = JSON.stringify(finalBillingAddress);

    // Create the order
    const order = await Order.create({
      user: req.user.id,
      orderNumber,
      subtotal,
      shippingCost,
      totalAmount,
      orderStatus: 'pending',
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
      paymentMethod: paymentMethod || 'cod',
      shippingStatus: 'pending',
      shippingAddress: addressString,
      billingAddress: billingAddressString,
      discountAmount,
      taxAmount: finalTaxAmount,
      couponCode: appliedCouponCode,
      notes
    });

    // Create order items and deduct inventory
    for (const pItem of processedItems) {
      await OrderItem.create({
        order: order._id,
        product: pItem.productId,
        productName: pItem.productName,
        sku: pItem.sku,
        price: pItem.price,
        quantity: pItem.quantity,
        variantDetails: pItem.variantDetails,
        taxRate: pItem.taxRate,
        taxAmount: pItem.taxAmount
      });

      // Deduct inventory
      const productToUpdate = await Product.findById(pItem.productId);
      if (productToUpdate) {
        productToUpdate.stockQuantity = Math.max(0, productToUpdate.stockQuantity - pItem.quantity);
        await productToUpdate.save();
      }
    }

    // Order created successfully — email will be sent when admin confirms the order.

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload user profile photo
// @route   POST /api/user-auth/profile/photo
// @access  Private (user)
const uploadProfilePhoto = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const photoUrl = req.file.path;
    user.profilePhoto = photoUrl;
    await user.save();

    res.json({
      success: true,
      message: 'Profile photo updated successfully',
      user: {
        id: user.id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        status: user.status,
        address: user.address,
        city: user.city,
        state: user.state,
        zipCode: user.zipCode,
        gender: user.gender,
        profilePhoto: user.profilePhoto
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Razorpay Public Key
// @route   GET /api/user-auth/razorpay/config
// @access  Public
const getRazorpayConfig = (req, res, next) => {
  try {
    res.json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID || ''
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create Razorpay Order
// @route   POST /api/user-auth/razorpay/create-order
// @access  Private (user)
const createRazorpayOrder = async (req, res, next) => {
  try {
    const { items, couponCode } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'No items in order' });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ success: false, error: 'Razorpay keys not configured on server.' });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    let subtotal = 0;
    
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ success: false, error: `Product not found for ID ${item.productId}` });
      }
      const price = parseFloat(item.price);
      subtotal += price * item.quantity;
    }

    let discountAmount = 0;
    if (couponCode) {
      const codeUpper = couponCode.toString().toUpperCase().trim();
      const coupon = await Coupon.findOne({ code: codeUpper, status: true });
      if (coupon) {
        const now = new Date();
        const isStarted = !coupon.startDate || new Date(coupon.startDate) <= now;
        const isNotExpired = !coupon.expiryDate || new Date(coupon.expiryDate) >= now;
        const hasUsageLeft = coupon.usedCount < coupon.usageLimit;
        const meetsMinOrder = subtotal >= parseFloat(coupon.minOrderAmount);

        if (isStarted && isNotExpired && hasUsageLeft && meetsMinOrder) {
          if (coupon.type === 'percentage') {
            discountAmount = (subtotal * parseFloat(coupon.discountValue)) / 100;
          } else {
            discountAmount = parseFloat(coupon.discountValue);
          }
          if (discountAmount > subtotal) discountAmount = subtotal;
        }
      }
    }

    const totalAmount = subtotal - discountAmount;
    const amountInPaise = Math.round(totalAmount * 100);

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify Razorpay Payment and Place Order
// @route   POST /api/user-auth/razorpay/verify
// @access  Private (user)
const verifyRazorpayPayment = async (req, res, next) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      // Pass through for createOrder
      shippingAddress, 
      billingAddress, 
      items, 
      customerName, 
      customerPhone, 
      couponCode, 
      notes
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Missing payment details' });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    
    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const digest = shasum.digest('hex');

    if (digest !== razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Payment signature verification failed. Transaction is not legit!' });
    }

    // Since signature matches, payment is legit. We inject the proper paymentMethod and call the standard createOrder logic.
    // Instead of duplicating 150 lines, we can mock req.body.paymentMethod and call createOrder directly!
    // But createOrder will call res.json() or next(error).
    // So we can wrap res to intercept the success response and add our razorpay updates.

    req.body.paymentMethod = 'online';

    // We can just execute the logic. To avoid duplicating, let's extract the core of createOrder or just duplicate.
    // Given the simplicity, duplicating the DB creation block is safest to not break COD flow with res.json interception.
    
    // -- BEGIN DUPLICATED ORDER CREATION LOGIC --
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `ORD-${dateStr}-${randomStr}`;

    let subtotal = 0;
    let totalTaxAmount = 0;
    const processedItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) return res.status(404).json({ success: false, error: `Product not found for ID ${item.productId}` });
      const price = parseFloat(item.price);
      subtotal += price * item.quantity;
      const taxRate = product.taxRate || 0;
      const lineTotal = price * item.quantity;
      const basePrice = lineTotal / (1 + (taxRate / 100));
      const gst = lineTotal - basePrice;
      totalTaxAmount += gst;
      processedItems.push({
        productId: product.id, productName: product.name, sku: product.sku,
        price: price, quantity: item.quantity, variantDetails: item.variantDetails || null,
        taxRate: taxRate, taxAmount: gst
      });
    }

    let discountAmount = 0;
    let appliedCouponCode = null;
    if (couponCode) {
      const codeUpper = couponCode.toString().toUpperCase().trim();
      const coupon = await Coupon.findOne({ code: codeUpper, status: true });
      if (coupon) {
        appliedCouponCode = coupon.code;
        if (coupon.type === 'percentage') discountAmount = (subtotal * parseFloat(coupon.discountValue)) / 100;
        else discountAmount = parseFloat(coupon.discountValue);
        if (discountAmount > subtotal) discountAmount = subtotal;
        coupon.usedCount += 1;
        await coupon.save();
      }
    }

    const discountRatio = subtotal > 0 ? (discountAmount / subtotal) : 0;
    const finalTaxAmount = totalTaxAmount * (1 - discountRatio);
    const shippingCost = parseFloat(req.body.shippingCost) || 0;
    const totalAmount = subtotal - discountAmount + shippingCost;

    const finalAddress = typeof shippingAddress === 'object' ? shippingAddress : {
      name: customerName || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Customer',
      phone: customerPhone || req.user.phone || '',
      street: shippingAddress || req.user.address || 'N/A',
      city: req.user.city || '', state: req.user.state || '', zip: req.user.zipCode || '', country: 'India'
    };
    const finalBillingAddress = typeof billingAddress === 'object' ? billingAddress : finalAddress;

    const order = await Order.create({
      user: req.user.id, orderNumber, subtotal, shippingCost, totalAmount, orderStatus: 'pending',
      paymentStatus: 'paid',
      paymentMethod: 'online',
      shippingStatus: 'pending',
      shippingAddress: JSON.stringify(finalAddress), billingAddress: JSON.stringify(finalBillingAddress),
      discountAmount, taxAmount: finalTaxAmount, couponCode: appliedCouponCode, notes,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id
    });

    for (const pItem of processedItems) {
      await OrderItem.create({
        order: order._id, product: pItem.productId, productName: pItem.productName, sku: pItem.sku,
        price: pItem.price, quantity: pItem.quantity, variantDetails: pItem.variantDetails,
        taxRate: pItem.taxRate, taxAmount: pItem.taxAmount
      });
      const productToUpdate = await Product.findById(pItem.productId);
      if (productToUpdate) {
        productToUpdate.stockQuantity = Math.max(0, productToUpdate.stockQuantity - pItem.quantity);
        await productToUpdate.save();
      }
    }

    // Order created successfully — email will be sent when admin confirms the order.
    // -- END DUPLICATED LOGIC --

    res.status(201).json({
      success: true,
      message: 'Order created and payment verified successfully',
      order
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendOtp,
  verifyOtp,
  validateCoupon,
  getUserProfile,
  getUserOrders,
  updateUserProfile,
  createOrder,
  uploadProfilePhoto,
  createRazorpayOrder,
  verifyRazorpayPayment,
  getRazorpayConfig
};
