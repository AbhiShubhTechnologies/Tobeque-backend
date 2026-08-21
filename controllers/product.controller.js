const { Product, ProductImage, Category, Brand, InventoryLog, AdminLog, Review } = require('../models');
const { deleteCloudinaryAsset, deleteCloudinaryAssets } = require('../utils/cloudinary');

// Helper to slugify strings
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-'); // Replace multiple - with single -
};

// @desc    Get List of Products
// @route   GET /api/products
// @access  Private
const getProducts = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      category,
      brand,
      status,
      featured,
      isOnSaleSection,
      isHotRightNow,
      sortBy = 'createdAt',
      sortDir = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    // Build query conditions
    const where = {};

    if (search) {
      let searchTerms = [search];
      const s = search.toLowerCase();
      if (s.includes('blue')) searchTerms.push('navy', 'teal', 'cyan', 'denim', 'sapphire', 'azure');
      if (s.includes('red')) searchTerms.push('maroon', 'burgundy', 'wine', 'crimson', 'ruby');
      if (s.includes('green')) searchTerms.push('olive', 'mint', 'emerald', 'forest', 'khaki');
      if (s.includes('white')) searchTerms.push('ivory', 'cream', 'snow', 'off-white');
      if (s.includes('grey') || s.includes('gray')) searchTerms.push('silver', 'charcoal', 'ash', 'slate');
      if (s.includes('brown') || s.includes('beige')) searchTerms.push('tan', 'chocolate', 'camel', 'beige', 'mocha', 'sand', 'oatmeal');
      if (s.includes('pink')) searchTerms.push('rose', 'magenta', 'fuchsia', 'peach');
      if (s.includes('yellow')) searchTerms.push('mustard', 'gold', 'lemon');

      // Add singular/plural variants for better matching (e.g. "tops" -> "top")
      if (s.endsWith('s')) searchTerms.push(s.slice(0, -1));
      if (s.endsWith('es')) searchTerms.push(s.slice(0, -2));
      if (!s.endsWith('s')) searchTerms.push(s + 's');

      // Remove duplicates
      searchTerms = [...new Set(searchTerms)];

      const escapeRegex = (text) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const regexes = searchTerms.map(term => {
        try {
          return new RegExp(escapeRegex(term), 'i');
        } catch (e) {
          return new RegExp(term.replace(/[^\w\s]/gi, ''), 'i');
        }
      });

      // Find matching categories by name or slug to include in product search
      const matchingCats = await Category.find({
        $or: [
          { name: { $in: regexes } },
          { slug: { $in: regexes } }
        ]
      }).select('_id');
      const catIds = matchingCats.map(c => c._id);

      where.$or = [
        { name: { $in: regexes } },
        { slug: { $in: regexes } },
        { sku: { $in: regexes } },
        { barcode: { $in: regexes } },
        { shortDescription: { $in: regexes } },
        { fullDescription: { $in: regexes } },
        { colors: { $in: regexes } },
        { 'variants.color': { $in: regexes } },
        { 'variants.Color': { $in: regexes } }
      ];
      
      if (catIds.length > 0) {
        where.$or.push({ category: { $in: catIds } });
        where.$or.push({ additionalCategories: { $in: catIds } });
      }
    }

    if (category && category.toString().toLowerCase() !== 'all') {
      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(category)) {
        where.$or = (where.$or || []).concat([
          { category: category },
          { additionalCategories: category }
        ]);
      } else {
        const categoryDoc = await Category.findOne({ 
          $or: [
            { slug: category },
            { name: new RegExp('^' + category + '$', 'i') }
          ]
        });
        if (categoryDoc) {
          where.$or = (where.$or || []).concat([
            { category: categoryDoc._id },
            { additionalCategories: categoryDoc._id }
          ]);
        } else {
          where.category = null; // force empty result if category not found
        }
      }
    }

    if (brand) {
      where.brand = brand;
    }

    if (status) {
      where.status = status;
    }

    if (featured !== undefined) {
      where.isFeatured = featured === 'true';
    }

    if (isOnSaleSection !== undefined) {
      where.isOnSaleSection = isOnSaleSection === 'true';
    }

    if (isHotRightNow !== undefined) {
      where.isHotRightNow = isHotRightNow === 'true';
    }

    const count = await Product.countDocuments(where);
    const rows = await Product.find(where)
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .sort({ [sortBy]: sortDir.toUpperCase() === 'DESC' ? -1 : 1 })
      .populate('category', 'id name')
      .populate('brand', 'id name')
      .populate('images', 'id imageUrl color');

    res.json({
      success: true,
      data: {
        products: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Single Product Detail
// @route   GET /api/products/:id
// @access  Private
const getProductById = async (req, res, next) => {
  try {
    const mongoose = require('mongoose');
    const param = req.params.id;
    const query = mongoose.Types.ObjectId.isValid(param) ? { _id: param } : { slug: param };

    const product = await Product.findOne(query)
      .populate('category', 'id name slug')
      .populate('brand', 'id name')
      .populate('images', 'id imageUrl color')
      .populate('styleItWith', 'id name price thumbnail slug')
      .populate('relatedCategories', 'id name slug');

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    res.json({
      success: true,
      product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create Product
// @route   POST /api/products
// @access  Private
const createProduct = async (req, res, next) => {
  try {
    const {
      name,
      sku,
      barcode,
      shortDescription,
      fullDescription,
      price,
      discountPrice,
      taxRate,
      stockQuantity,
      weight,
      dimensions,
      status,
      isFeatured,
      isOnSaleSection,
      isHotRightNow,
      categoryId,
      additionalCategories,
      brandId,
      variants,
      slug: customSlug,
      seoTitle,
      seoDescription,
      seoKeywords,
      seoSchema,
      imageAltTag,
      countdownEvergreen,
      restartCountdownAfter,
      countdownTimerProfile,
      enableProgressBar,
      whenAchievingGoal,
      goal,
      initialQuantity,
      taxStatus,
      taxClass,
      hsnSacCode,
      whatsAppNumber,
      callToAction,
      preFilledMessage,
      displaySettings,
      imageColors,
      colors,
      styleItWith,
      relatedCategories,
      show7DayReturn,
      showFreeShipping,
      showCodAvailable,
      sizeChart,
      fabricCare,
      shippingReturns,
      customSections
    } = req.body;

    // Check SKU unique
    const skuExists = await Product.findOne({ sku });
    if (skuExists) {
      return res.status(400).json({ success: false, error: `SKU '${sku}' already exists` });
    }

    // Auto slug
    const slug = customSlug ? slugify(customSlug) : (slugify(name) + '-' + Math.floor(Math.random() * 1000));

    // Get thumbnail from uploaded files (Multer saves to req.file or req.files)
    let thumbnail = '';
    if (req.files && req.files.thumbnail) {
      thumbnail = req.files.thumbnail[0].path;
    }

    let hotRightNowMedia = '';
    if (req.files && req.files.hotRightNowMedia) {
      hotRightNowMedia = req.files.hotRightNowMedia[0].path;
    }

    // Parse variants if they are sent as JSON strings
    let parsedVariants = variants;
    if (typeof variants === 'string') {
      try {
        parsedVariants = JSON.parse(variants);
      } catch (err) {
        parsedVariants = null;
      }
    }

    let parsedColors = [];
    if (colors) {
      if (Array.isArray(colors)) {
        parsedColors = colors;
      } else if (typeof colors === 'string') {
        const trimmed = colors.trim();
        if (trimmed.startsWith('[')) {
          try { parsedColors = JSON.parse(trimmed).filter(Boolean); } catch(e) { parsedColors = []; }
        } else {
          parsedColors = trimmed.split(',').map(c => c.trim()).filter(Boolean);
        }
      }
    }

    let parsedStyleItWith = [];
    if (styleItWith) {
      parsedStyleItWith = Array.isArray(styleItWith) ? styleItWith : (typeof styleItWith === 'string' ? JSON.parse(styleItWith) : []);
    }

    let parsedRelatedCategories = [];
    if (relatedCategories) {
      parsedRelatedCategories = Array.isArray(relatedCategories) ? relatedCategories : (typeof relatedCategories === 'string' ? JSON.parse(relatedCategories) : []);
    }

    let parsedAdditionalCategories = [];
    if (additionalCategories) {
      parsedAdditionalCategories = Array.isArray(additionalCategories) ? additionalCategories : (typeof additionalCategories === 'string' ? JSON.parse(additionalCategories) : []);
    }

    let parsedSizeChart = null;
    if (sizeChart) {
      parsedSizeChart = typeof sizeChart === 'string' ? (sizeChart ? JSON.parse(sizeChart) : null) : sizeChart;
    }

    let parsedCustomSections = [];
    if (customSections) {
      parsedCustomSections = typeof customSections === 'string' ? JSON.parse(customSections) : customSections;
    }

    let parsedColorSwatches = [];
    if (req.body.colorSwatches) {
      try {
        parsedColorSwatches = typeof req.body.colorSwatches === 'string' ? JSON.parse(req.body.colorSwatches) : req.body.colorSwatches;
      } catch (e) {
        parsedColorSwatches = [];
      }
    }

    if (req.files && req.files.colorSwatchImages) {
      let swatchColors = req.body.colorSwatchColors;
      if (swatchColors) {
        if (typeof swatchColors === 'string') {
          try { swatchColors = JSON.parse(swatchColors); } catch(e) { swatchColors = [swatchColors]; }
        }
      } else {
        swatchColors = [];
      }
      req.files.colorSwatchImages.forEach((file, idx) => {
        const colName = (swatchColors[idx] || '').trim();
        if (colName) {
          const existing = parsedColorSwatches.find(s => s.color.toLowerCase().trim() === colName.toLowerCase());
          if (existing) {
            existing.image = file.path;
          } else {
            parsedColorSwatches.push({ color: colName, image: file.path });
          }
        }
      });
    }

    const product = await Product.create({
      name,
      slug,
      sku,
      barcode,
      shortDescription,
      fullDescription,
      price: parseFloat(price) || 0.00,
      discountPrice: discountPrice ? parseFloat(discountPrice) : null,
      taxRate: parseFloat(taxRate) || 0.00,
      stockQuantity: parseInt(stockQuantity) || 0,
      weight: weight ? parseFloat(weight) : null,
      dimensions,
      status: status || 'draft',
      isFeatured: isFeatured === 'true' || isFeatured === true,
      isOnSaleSection: isOnSaleSection === 'true' || isOnSaleSection === true,
      isHotRightNow: isHotRightNow === 'true' || isHotRightNow === true,
      show7DayReturn: show7DayReturn !== undefined ? (show7DayReturn === 'true' || show7DayReturn === true) : true,
      showFreeShipping: showFreeShipping !== undefined ? (showFreeShipping === 'true' || showFreeShipping === true) : true,
      showCodAvailable: showCodAvailable !== undefined ? (showCodAvailable === 'true' || showCodAvailable === true) : true,
      hotRightNowMedia,
      thumbnail,
      thumbnailColor: req.body.thumbnailColor || '',
      colors: parsedColors,
      colorSwatches: parsedColorSwatches,
      category: categoryId || null,
      additionalCategories: parsedAdditionalCategories,
      brand: brandId || null,
      variants: parsedVariants,
      seoTitle,
      seoDescription,
      seoKeywords,
      seoSchema,
      imageAltTag,
      countdownEvergreen: countdownEvergreen === 'true' || countdownEvergreen === true,
      restartCountdownAfter: restartCountdownAfter ? parseInt(restartCountdownAfter) : null,
      countdownTimerProfile,
      enableProgressBar: enableProgressBar === 'true' || enableProgressBar === true,
      whenAchievingGoal,
      goal: goal ? parseInt(goal) : null,
      initialQuantity: initialQuantity ? parseInt(initialQuantity) : null,
      taxStatus,
      taxClass,
      hsnSacCode,
      whatsAppNumber,
      callToAction,
      preFilledMessage,
      displaySettings,
      styleItWith: parsedStyleItWith,
      relatedCategories: parsedRelatedCategories,
      sizeChart: parsedSizeChart,
      fabricCare,
      shippingReturns,
      customSections: parsedCustomSections
    });

    // Record stock addition log
    await InventoryLog.create({
      productId: product.id,
      stockChanged: product.stockQuantity,
      actionType: 'restock',
      reference: 'Initial product stock creation',
      adminId: req.admin.id
    });

    // Create additional product gallery images if uploaded
    if (req.files && req.files.images) {
      let parsedImageColors = [];
      if (imageColors) {
        parsedImageColors = Array.isArray(imageColors) ? imageColors : [imageColors];
      }
      const imageRecords = req.files.images.map((img, idx) => ({
        product: product.id,
        imageUrl: img.path,
        color: parsedImageColors[idx] || null
      }));
      await ProductImage.insertMany(imageRecords);
    }

    // Save Admin action log
    await AdminLog.create({
      adminId: req.admin.id,
      action: `Created product: ${product.name}`,
      entityType: 'product',
      entityId: product.id,
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update Product
// @route   PUT /api/products/:id
// @access  Private
const updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const oldStock = product.stockQuantity;

    const {
      name,
      sku,
      barcode,
      shortDescription,
      fullDescription,
      price,
      discountPrice,
      taxRate,
      stockQuantity,
      weight,
      dimensions,
      status,
      isFeatured,
      isOnSaleSection,
      isHotRightNow,
      categoryId,
      additionalCategories,
      brandId,
      variants,
      seoTitle,
      seoDescription,
      countdownEvergreen,
      restartCountdownAfter,
      countdownTimerProfile,
      enableProgressBar,
      whenAchievingGoal,
      goal,
      initialQuantity,
      taxStatus,
      taxClass,
      hsnSacCode,
      whatsAppNumber,
      callToAction,
      preFilledMessage,
      displaySettings,
      imageColors,
      colors,
      styleItWith,
      relatedCategories,
      show7DayReturn,
      showFreeShipping,
      showCodAvailable,
      sizeChart,
      fabricCare,
      shippingReturns,
      customSections
    } = req.body;

    console.log("====== DEBUG UPDATE PRODUCT ======");
    console.log("Product ID:", req.params.id);
    console.log("Received styleItWith (type):", typeof styleItWith);
    console.log("Received styleItWith (val):", styleItWith);
    console.log("==================================");

    if (sku && sku !== product.sku) {
      const skuExists = await Product.findOne({ sku });
      if (skuExists) {
        return res.status(400).json({ success: false, error: `SKU '${sku}' already exists` });
      }
      product.sku = sku;
    }

    const { slug: customSlug, seoKeywords, seoSchema, imageAltTag } = req.body;

    if (customSlug && customSlug !== product.slug) {
      product.slug = slugify(customSlug);
    } else if (name && name !== product.name && !customSlug) {
      product.name = name;
      product.slug = slugify(name) + '-' + Math.floor(Math.random() * 1000);
    } else if (name) {
      product.name = name;
    }

    product.barcode = barcode !== undefined ? barcode : product.barcode;
    product.shortDescription = shortDescription !== undefined ? shortDescription : product.shortDescription;
    product.fullDescription = fullDescription !== undefined ? fullDescription : product.fullDescription;
    product.price = price !== undefined ? parseFloat(price) : product.price;
    product.discountPrice = discountPrice !== undefined ? (discountPrice ? parseFloat(discountPrice) : null) : product.discountPrice;
    product.taxRate = taxRate !== undefined ? parseFloat(taxRate) : product.taxRate;
    product.weight = weight !== undefined ? (weight ? parseFloat(weight) : null) : product.weight;
    product.dimensions = dimensions !== undefined ? dimensions : product.dimensions;
    product.status = status !== undefined ? status : product.status;
    product.seoTitle = seoTitle !== undefined ? seoTitle : product.seoTitle;
    product.seoDescription = seoDescription !== undefined ? seoDescription : product.seoDescription;
    product.seoKeywords = seoKeywords !== undefined ? seoKeywords : product.seoKeywords;
    product.seoSchema = seoSchema !== undefined ? seoSchema : product.seoSchema;
    product.imageAltTag = imageAltTag !== undefined ? imageAltTag : product.imageAltTag;
    product.category = categoryId !== undefined ? (categoryId || null) : product.category;
    if (additionalCategories !== undefined) {
      product.additionalCategories = Array.isArray(additionalCategories) ? additionalCategories : (typeof additionalCategories === 'string' ? JSON.parse(additionalCategories) : []);
    }
    product.brand = brandId !== undefined ? (brandId || null) : product.brand;
    
    product.countdownTimerProfile = countdownTimerProfile !== undefined ? countdownTimerProfile : product.countdownTimerProfile;
    product.whenAchievingGoal = whenAchievingGoal !== undefined ? whenAchievingGoal : product.whenAchievingGoal;
    product.taxStatus = taxStatus !== undefined ? taxStatus : product.taxStatus;
    product.taxClass = taxClass !== undefined ? taxClass : product.taxClass;
    product.hsnSacCode = hsnSacCode !== undefined ? hsnSacCode : product.hsnSacCode;
    product.whatsAppNumber = whatsAppNumber !== undefined ? whatsAppNumber : product.whatsAppNumber;
    product.callToAction = callToAction !== undefined ? callToAction : product.callToAction;
    product.preFilledMessage = preFilledMessage !== undefined ? preFilledMessage : product.preFilledMessage;
    product.displaySettings = displaySettings !== undefined ? displaySettings : product.displaySettings;

    if (show7DayReturn !== undefined) {
      product.show7DayReturn = show7DayReturn === 'true' || show7DayReturn === true;
    }
    if (showFreeShipping !== undefined) {
      product.showFreeShipping = showFreeShipping === 'true' || showFreeShipping === true;
    }
    if (showCodAvailable !== undefined) {
      product.showCodAvailable = showCodAvailable === 'true' || showCodAvailable === true;
    }

    if (styleItWith !== undefined) {
      product.styleItWith = Array.isArray(styleItWith) ? styleItWith : (typeof styleItWith === 'string' ? JSON.parse(styleItWith) : []);
    }

    if (relatedCategories !== undefined) {
      product.relatedCategories = Array.isArray(relatedCategories) ? relatedCategories : (typeof relatedCategories === 'string' ? JSON.parse(relatedCategories) : []);
    }

    if (fabricCare !== undefined) {
      product.fabricCare = fabricCare;
    }

    if (shippingReturns !== undefined) {
      product.shippingReturns = shippingReturns;
    }

    if (customSections !== undefined) {
      product.customSections = typeof customSections === 'string' ? JSON.parse(customSections) : customSections;
    }

    if (sizeChart !== undefined) {
      if (!sizeChart || sizeChart === 'null' || sizeChart === 'undefined') {
        product.sizeChart = null;
      } else {
        product.sizeChart = typeof sizeChart === 'string' ? JSON.parse(sizeChart) : sizeChart;
      }
    }

    if (colors !== undefined) {
      if (Array.isArray(colors)) {
        product.colors = colors;
      } else if (typeof colors === 'string') {
        const cTrimmed = colors.trim();
        if (cTrimmed.startsWith('[')) {
          try { product.colors = JSON.parse(cTrimmed).filter(Boolean); } catch(e) { product.colors = []; }
        } else {
          product.colors = cTrimmed.split(',').map(c => c.trim()).filter(Boolean);
        }
      }
    }

    if (req.body.colorSwatches !== undefined || (req.files && req.files.colorSwatchImages)) {
      let parsedColorSwatches = product.colorSwatches || [];
      if (req.body.colorSwatches !== undefined) {
        try {
          parsedColorSwatches = typeof req.body.colorSwatches === 'string' ? JSON.parse(req.body.colorSwatches) : req.body.colorSwatches;
        } catch (e) {
          parsedColorSwatches = [];
        }
      }

      if (req.files && req.files.colorSwatchImages) {
        let swatchColors = req.body.colorSwatchColors;
        if (swatchColors) {
          if (typeof swatchColors === 'string') {
            try { swatchColors = JSON.parse(swatchColors); } catch(e) { swatchColors = [swatchColors]; }
          }
        } else {
          swatchColors = [];
        }
        req.files.colorSwatchImages.forEach((file, idx) => {
          const colName = (swatchColors[idx] || '').trim();
          if (colName) {
            const existing = parsedColorSwatches.find(s => s.color.toLowerCase().trim() === colName.toLowerCase());
            if (existing) {
              existing.image = file.path;
            } else {
              parsedColorSwatches.push({ color: colName, image: file.path });
            }
          }
        });
      }

      product.colorSwatches = parsedColorSwatches;
    }

    if (countdownEvergreen !== undefined) {
      product.countdownEvergreen = countdownEvergreen === 'true' || countdownEvergreen === true;
    }
    if (enableProgressBar !== undefined) {
      product.enableProgressBar = enableProgressBar === 'true' || enableProgressBar === true;
    }
    if (restartCountdownAfter !== undefined) {
      product.restartCountdownAfter = restartCountdownAfter ? parseInt(restartCountdownAfter) : null;
    }
    if (goal !== undefined) {
      product.goal = goal ? parseInt(goal) : null;
    }
    if (initialQuantity !== undefined) {
      product.initialQuantity = initialQuantity ? parseInt(initialQuantity) : null;
    }

    if (isFeatured !== undefined) {
      product.isFeatured = isFeatured === 'true' || isFeatured === true;
    }
    if (isOnSaleSection !== undefined) {
      product.isOnSaleSection = isOnSaleSection === 'true' || isOnSaleSection === true;
    }
    if (isHotRightNow !== undefined) {
      product.isHotRightNow = isHotRightNow === 'true' || isHotRightNow === true;
    }

    // Set new stock
    if (stockQuantity !== undefined) {
      const newStockVal = parseInt(stockQuantity);
      if (newStockVal !== oldStock) {
        product.stockQuantity = newStockVal;
        
        // Log the inventory stock diff
        const diff = newStockVal - oldStock;
        await InventoryLog.create({
          productId: product.id,
          stockChanged: diff,
          actionType: 'correction',
          reference: 'Admin stock inventory adjustment',
          adminId: req.admin.id
        });
      }
    }

    // Set new thumbnail if uploaded
    if (req.files && req.files.thumbnail) {
      // Delete the old thumbnail from Cloudinary before replacing
      if (product.thumbnail) {
        await deleteCloudinaryAsset(product.thumbnail);
      }
      product.thumbnail = req.files.thumbnail[0].path;
    }

    // Always update thumbnailColor if provided
    if (req.body.thumbnailColor !== undefined) {
      product.thumbnailColor = req.body.thumbnailColor || '';
    }

    if (req.files && req.files.hotRightNowMedia) {
      if (product.hotRightNowMedia) {
        await deleteCloudinaryAsset(product.hotRightNowMedia);
      }
      product.hotRightNowMedia = req.files.hotRightNowMedia[0].path;
    }

    // Parse and update variants
    if (variants !== undefined) {
      let parsedVariants = variants;
      if (typeof variants === 'string') {
        try {
          parsedVariants = JSON.parse(variants);
        } catch (err) {
          parsedVariants = product.variants;
        }
      }
      product.variants = parsedVariants;
    }

    await product.save();

    // Create additional product gallery images if uploaded
    if (req.files && req.files.images) {
      let parsedImageColors = [];
      if (imageColors) {
        parsedImageColors = Array.isArray(imageColors) ? imageColors : [imageColors];
      }
      const imageRecords = req.files.images.map((img, idx) => ({
        product: product.id,
        imageUrl: img.path,
        color: parsedImageColors[idx] || null
      }));
      await ProductImage.insertMany(imageRecords);
    }

    // Patch color on existing images if the admin updated color tags
    const { existingImageColors } = req.body;
    if (existingImageColors) {
      let colorMap;
      try {
        colorMap = typeof existingImageColors === 'string' ? JSON.parse(existingImageColors) : existingImageColors;
      } catch (e) {
        colorMap = null;
      }
      if (colorMap && typeof colorMap === 'object') {
        const bulkOps = Object.entries(colorMap).map(([imgId, color]) => ({
          updateOne: {
            filter: { _id: imgId, product: product.id },
            update: { $set: { color: color || null } }
          }
        }));
        if (bulkOps.length > 0) {
          await ProductImage.bulkWrite(bulkOps);
        }
      }
    }

    // Log Admin action
    await AdminLog.create({
      adminId: req.admin.id,
      action: `Updated product details: ${product.name}`,
      entityType: 'product',
      entityId: product.id,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      product
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete Product
// @route   DELETE /api/products/:id
// @access  Private
const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const prodName = product.name;
    const prodId = product.id;
    const thumbnail = product.thumbnail;
    const hotRightNowMedia = product.hotRightNowMedia;

    // Fetch all gallery image URLs before deleting DB records
    const galleryImages = await ProductImage.find({ product: prodId }).select('imageUrl').lean();
    const galleryUrls = galleryImages.map(img => img.imageUrl);

    // Manually delete dependent records
    await ProductImage.deleteMany({ product: prodId });
    await InventoryLog.deleteMany({ productId: prodId });
    await Review.deleteMany({ product: prodId });

    await product.deleteOne();

    // Clean up all images from Cloudinary (thumbnail + gallery) in background
    const allImageUrls = [thumbnail, hotRightNowMedia, ...galleryUrls].filter(Boolean);
    await deleteCloudinaryAssets(allImageUrls);

    await AdminLog.create({
      adminId: req.admin.id,
      action: `Deleted product: ${prodName}`,
      entityType: 'product',
      entityId: prodId,
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: 'Product successfully removed from catalog'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete Product Image
// @route   DELETE /api/products/:id/images/:imageId
// @access  Private
const deleteProductImage = async (req, res, next) => {
  try {
    const { id, imageId } = req.params;
    
    // Ensure product exists
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const image = await ProductImage.findOne({ _id: imageId, product: id });
    if (!image) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }

    const imageUrl = image.imageUrl;
    await image.deleteOne();

    // Clean up from Cloudinary
    if (imageUrl) {
      await deleteCloudinaryAsset(imageUrl);
    }

    await AdminLog.create({
      adminId: req.admin.id,
      action: `Deleted image ${imageId} from product: ${product.name}`,
      entityType: 'product',
      entityId: product.id,
      ipAddress: req.ip
    });

    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteProductImage
};
