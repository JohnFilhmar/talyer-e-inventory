const Product = require('../models/Product');
const Category = require('../models/Category');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');
const CacheUtil = require('../utils/cache');
const { CACHE_TTL, PAGINATION } = require('../config/constants');

/**
 * @desc    Get all products with filters
 * @route   GET /api/products
 * @access  Private
 */
exports.getProducts = asyncHandler(async (req, res) => {
  const {
    category,
    brand,
    active,
    discontinued,
    search,
    minPrice,
    maxPrice,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Build query
  const query = {};
  
  if (category) {
    query.category = category;
  }
  
  if (brand) {
    query.brand = { $regex: brand, $options: 'i' };
  }
  
  if (active !== undefined) {
    query.isActive = active === 'true';
  }
  
  if (discontinued !== undefined) {
    query.isDiscontinued = discontinued === 'true';
  }
  
  if (search) {
    query.$text = { $search: search };
  }
  
  if (minPrice || maxPrice) {
    query.sellingPrice = {};
    if (minPrice) query.sellingPrice.$gte = parseFloat(minPrice);
    if (maxPrice) query.sellingPrice.$lte = parseFloat(maxPrice);
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  // Sort
  const sort = {};
  sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

  // Execute query
  const [products, total] = await Promise.all([
    Product.find(query)
      .populate('category', 'name code color')
      .sort(sort)
      .skip(skip)
      .limit(limitNum),
    Product.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    products,
    pageNum,
    limitNum,
    total,
    'Products retrieved successfully'
  );
});

/**
 * @desc    Get single product
 * @route   GET /api/products/:id
 * @access  Private
 */
exports.getProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check cache
  const cacheKey = CacheUtil.generateKey('product', id);
  const cached = await CacheUtil.get(cacheKey);
  
  if (cached) {
    return ApiResponse.success(res, 200, 'Product retrieved from cache', cached);
  }

  const product = await Product.findById(id).populate('category', 'name code color');

  if (!product) {
    return ApiResponse.error(res, 404, 'Product not found');
  }

  // Cache the result
  await CacheUtil.set(cacheKey, product, CACHE_TTL.LONG);

  return ApiResponse.success(res, 200, 'Product retrieved successfully', product);
});

/**
 * @desc    Search products (advanced)
 * @route   GET /api/products/search
 * @access  Private
 */
exports.searchProducts = asyncHandler(async (req, res) => {
  const { q, limit = 10 } = req.query;

  if (!q) {
    return ApiResponse.error(res, 400, 'Search query is required');
  }

  // Check cache
  const cacheKey = CacheUtil.generateKey('products', 'search', q, limit);
  const cached = await CacheUtil.get(cacheKey);
  
  if (cached) {
    return ApiResponse.success(res, 200, 'Search results from cache', cached);
  }

  const products = await Product.find({
    $or: [
      { name: { $regex: q, $options: 'i' } },
      { sku: { $regex: q, $options: 'i' } },
      { brand: { $regex: q, $options: 'i' } },
      { barcode: { $regex: q, $options: 'i' } }
    ],
    isActive: true
  })
    .select('sku name brand sellingPrice images category')
    .populate('category', 'name code')
    .limit(parseInt(limit));

  // Cache for short time
  await CacheUtil.set(cacheKey, products, CACHE_TTL.SHORT);

  return ApiResponse.success(res, 200, 'Search completed', products);
});

/**
 * @desc    Create new product
 * @route   POST /api/products
 * @access  Private (Admin only)
 */
exports.createProduct = asyncHandler(async (req, res) => {
  const {
    sku,
    name,
    description,
    category,
    brand,
    model,
    costPrice,
    sellingPrice,
    barcode,
    images,
    specifications,
    tags
  } = req.body;

  // Check if category exists
  const categoryExists = await Category.findById(category);
  if (!categoryExists) {
    return ApiResponse.error(res, 404, 'Category not found');
  }

  try {
    // Create product
    const product = await Product.create({
      sku,
      name,
      description,
      category,
      brand,
      model,
      costPrice,
      sellingPrice,
      barcode,
      images,
      specifications,
      tags
    });

    const populatedProduct = await Product.findById(product._id).populate('category', 'name code');

    // Invalidate cache
    await CacheUtil.delPattern('cache:products:*');
    await CacheUtil.delPattern('cache:category:*');

    return ApiResponse.success(res, 201, 'Product created successfully', populatedProduct);
  } catch (error) {
    // Handle duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return ApiResponse.error(res, 400, `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`);
    }
    // Re-throw other errors to be handled by error handler
    throw error;
  }
});

/**
 * @desc    Update product
 * @route   PUT /api/products/:id
 * @access  Private (Admin only)
 */
exports.updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let product = await Product.findById(id);

  if (!product) {
    return ApiResponse.error(res, 404, 'Product not found');
  }

  // If category is being updated, check if it exists
  if (req.body.category) {
    const categoryExists = await Category.findById(req.body.category);
    if (!categoryExists) {
      return ApiResponse.error(res, 404, 'Category not found');
    }
  }

  // Update product
  product = await Product.findByIdAndUpdate(
    id,
    req.body,
    { new: true, runValidators: true }
  ).populate('category', 'name code');

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('product', id));
  await CacheUtil.delPattern('cache:products:*');

  return ApiResponse.success(res, 200, 'Product updated successfully', product);
});

/**
 * @desc    Delete product
 * @route   DELETE /api/products/:id
 * @access  Private (Admin only)
 */
exports.deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const product = await Product.findById(id);

  if (!product) {
    return ApiResponse.error(res, 404, 'Product not found');
  }

  // Soft delete
  product.isActive = false;
  product.isDiscontinued = true;
  await product.save();

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('product', id));
  await CacheUtil.delPattern('cache:products:*');

  return ApiResponse.success(
    res,
    200,
    'Product discontinued successfully',
    { id: product._id, name: product.name, isActive: false, isDiscontinued: true }
  );
});

const { deleteImageFile, getFilenameFromUrl } = require('../middleware/imageUpload');

/**
 * @desc    Add product image (via file upload)
 * @route   POST /api/products/:id/images
 * @access  Private (Admin only)
 * @note    Accepts FormData with 'image' field and optional 'isPrimary' field
 */
exports.addProductImage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isPrimary } = req.body;

  // Check if image was processed (from uploadSingleImage + processImage middleware)
  if (!req.processedImage) {
    return ApiResponse.error(res, 400, 'Image file is required');
  }

  const product = await Product.findById(id);

  if (!product) {
    // Clean up uploaded file if product not found
    deleteImageFile(req.processedImage.filename);
    return ApiResponse.error(res, 404, 'Product not found');
  }

  // If setting as primary, remove primary flag from others
  const shouldBePrimary = isPrimary === 'true' || isPrimary === true;
  if (shouldBePrimary) {
    product.images.forEach(img => {
      img.isPrimary = false;
    });
  }

  // Add the new image
  product.images.push({
    url: req.processedImage.url,
    isPrimary: shouldBePrimary || product.images.length === 0, // First image is primary by default
  });

  await product.save();

  // Populate category for response
  await product.populate('category', 'name code color');

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('product', id));

  return ApiResponse.success(res, 201, 'Image uploaded successfully', product);
});

/**
 * @desc    Add product image via URL (legacy support)
 * @route   POST /api/products/:id/images/url
 * @access  Private (Admin only)
 */
exports.addProductImageUrl = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { url, isPrimary } = req.body;

  if (!url) {
    return ApiResponse.error(res, 400, 'Image URL is required');
  }

  const product = await Product.findById(id);

  if (!product) {
    return ApiResponse.error(res, 404, 'Product not found');
  }

  // If setting as primary, remove primary flag from others
  if (isPrimary) {
    product.images.forEach(img => {
      img.isPrimary = false;
    });
  }

  product.images.push({ url, isPrimary: isPrimary || false });
  await product.save();

  // Populate category for response
  await product.populate('category', 'name code color');

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('product', id));

  return ApiResponse.success(res, 201, 'Image added successfully', product);
});

/**
 * @desc    Delete product image
 * @route   DELETE /api/products/:id/images/:imageId
 * @access  Private (Admin only)
 */
exports.deleteProductImage = asyncHandler(async (req, res) => {
  const { id, imageId } = req.params;

  const product = await Product.findById(id);

  if (!product) {
    return ApiResponse.error(res, 404, 'Product not found');
  }

  const imageIndex = product.images.findIndex(
    img => img._id.toString() === imageId
  );

  if (imageIndex === -1) {
    return ApiResponse.error(res, 404, 'Image not found');
  }

  // Get the image URL before removing
  const imageUrl = product.images[imageIndex].url;

  // Remove image from array
  product.images.splice(imageIndex, 1);
  await product.save();

  // Delete the file from storage if it's a local upload
  // Handle both full URLs (http://localhost:5000/uploads/...) and relative paths (/uploads/...)
  if (imageUrl && (imageUrl.includes('/uploads/products/') || imageUrl.startsWith('/uploads/'))) {
    const filename = getFilenameFromUrl(imageUrl);
    if (filename) {
      const deleted = deleteImageFile(filename);
      if (deleted) {
        console.log(`Successfully deleted image file: ${filename}`);
      } else {
        console.warn(`Could not delete image file: ${filename}`);
      }
    }
  }

  // Populate category for response
  await product.populate('category', 'name code color');

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('product', id));

  return ApiResponse.success(res, 200, 'Image deleted successfully', product);
});
