const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const { Product, Category, Brand, ProductImage } = require('../models');

require('dotenv').config();
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tobeque_ecommerce';

const importProducts = async () => {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected successfully to Live Database.');

    const csvFilePath = path.join(__dirname, '..', 'wc-product-export.csv');
    if (!fs.existsSync(csvFilePath)) {
      console.error('CSV file not found at:', csvFilePath);
      process.exit(1);
    }

    const results = [];
    console.log('Parsing CSV file...');
    
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => {
        // Only process simple and variable products, ignore variations to prevent duplicate listings
        if (data.Type === 'simple' || data.Type === 'variable') {
          results.push(data);
        }
      })
      .on('end', async () => {
        console.log(`Parsed ${results.length} products. Starting import process...`);
        let importedCount = 0;
        let updatedCount = 0;

        for (const row of results) {
          try {
            // 1. Process Category
            let categoryId = null;
            if (row.Categories) {
              const categoryNames = row.Categories.split(',').map(c => c.trim()).filter(Boolean);
              if (categoryNames.length > 0) {
                // Use the first category as main category
                const mainCategoryName = categoryNames[0];
                let category = await Category.findOne({ name: mainCategoryName });
                if (!category) {
                  const categorySlug = mainCategoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                  category = await Category.create({ name: mainCategoryName, slug: categorySlug });
                  console.log(`Created new Category: ${mainCategoryName}`);
                }
                categoryId = category._id;
              }
            }

            // 2. Process Brand
            let brandId = null;
            if (row.Brands) {
              const brandNames = row.Brands.split(',').map(b => b.trim()).filter(Boolean);
              if (brandNames.length > 0) {
                const mainBrandName = brandNames[0];
                let brand = await Brand.findOne({ name: mainBrandName });
                if (!brand) {
                  const brandSlug = mainBrandName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                  brand = await Brand.create({ name: mainBrandName, slug: brandSlug });
                  console.log(`Created new Brand: ${mainBrandName}`);
                }
                brandId = brand._id;
              }
            }

            // 3. Process Images
            let thumbnailUrl = '';
            let additionalImages = [];
            if (row.Images) {
              const imageUrls = row.Images.split(',').map(url => url.trim()).filter(Boolean);
              if (imageUrls.length > 0) {
                thumbnailUrl = imageUrls[0];
                if (imageUrls.length > 1) {
                  additionalImages = imageUrls.slice(1);
                }
              }
            }

            // 4. Construct Product Data
            const price = row['Regular price'] ? parseFloat(row['Regular price']) : 0;
            const discountPrice = row['Sale price'] ? parseFloat(row['Sale price']) : null;
            const stockQuantity = row.Stock ? parseInt(row.Stock, 10) : 0;
            const weight = row['Weight (kg)'] ? parseFloat(row['Weight (kg)']) : null;
            
            // Build variants from attributes if present
            const variants = [];
            const colors = [];
            
            if (row['Attribute 1 name'] === 'Size' && row['Attribute 1 value(s)']) {
               const sizes = row['Attribute 1 value(s)'].split(',').map(s => s.trim());
               sizes.forEach(size => {
                 variants.push({ size, color: '', stock: stockQuantity > 0 ? stockQuantity : 10, sku: `${row.SKU}-${size}` });
               });
            } else if (row['Attribute 2 name'] === 'Size' && row['Attribute 2 value(s)']) {
               const sizes = row['Attribute 2 value(s)'].split(',').map(s => s.trim());
               sizes.forEach(size => {
                 variants.push({ size, color: '', stock: stockQuantity > 0 ? stockQuantity : 10, sku: `${row.SKU}-${size}` });
               });
            }

            if (row['Attribute 1 name'] === 'Color' && row['Attribute 1 value(s)']) {
                row['Attribute 1 value(s)'].split(',').map(c => colors.push(c.trim()));
            } else if (row['Attribute 2 name'] === 'Color' && row['Attribute 2 value(s)']) {
                row['Attribute 2 value(s)'].split(',').map(c => colors.push(c.trim()));
            }

            const productData = {
              name: row.Name,
              slug: row.Name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + row.SKU.toLowerCase(),
              sku: row.SKU,
              shortDescription: row['Short description'] || '',
              fullDescription: row.Description || '',
              price: price,
              discountPrice: discountPrice,
              stockQuantity: stockQuantity,
              weight: weight,
              category: categoryId,
              brand: brandId,
              thumbnail: thumbnailUrl,
              status: row.Published == '1' ? 'published' : 'draft',
              isFeatured: row['Is featured?'] == '1',
              seoTitle: row['Meta: _yoast_wpseo_title'] || '',
              seoDescription: row['Meta: _yoast_wpseo_metadesc'] || '',
              colors: colors,
              variants: variants.length > 0 ? variants : undefined
            };

            // 5. Insert or Update Product
            let product = await Product.findOne({ sku: row.SKU });
            if (product) {
              await Product.updateOne({ sku: row.SKU }, productData);
              updatedCount++;
            } else {
              product = await Product.create(productData);
              importedCount++;
            }

            // 6. Insert Additional Images
            if (additionalImages.length > 0) {
              const productId = product ? product._id : (await Product.findOne({ sku: row.SKU }))._id;
              // Clear existing additional images to avoid duplicates on re-run
              await ProductImage.deleteMany({ product: productId });
              
              const imageDocs = additionalImages.map(url => ({
                product: productId,
                imageUrl: url
              }));
              await ProductImage.insertMany(imageDocs);
            }

            console.log(`Processed: ${row.Name} (${row.SKU})`);

          } catch (err) {
            console.error(`Error processing product ${row.SKU}:`, err.message);
          }
        }

        console.log(`\nImport Complete!`);
        console.log(`New Products Inserted: ${importedCount}`);
        console.log(`Existing Products Updated: ${updatedCount}`);
        process.exit(0);
      });

  } catch (error) {
    console.error('Failed to import products:', error);
    process.exit(1);
  }
};

importProducts();
