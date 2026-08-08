import Product from '../models/Product.js';
import Category from '../models/Category.js';
import MotorcycleModel from '../models/MotorcycleModel.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/apiResponse.js';
import CacheUtil from '../utils/cache.js';
import { CACHE_TTL, PAGINATION } from '../config/constants.js';

/** Fields of a motorcycle model a product read needs to render a fitment chip. */
const MOTORCYCLE_MODEL_SELECT = 'make model yearFrom yearTo code';

/**
 * Escapes a user-supplied string for use inside a RegExp. A shopper searching
 * "125i (2018)" must not have the parentheses read as a capture group.
 */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Normalises the `motorcycleModel` filter, which arrives either as a repeated
 * query param (`?motorcycleModel=a&motorcycleModel=b`, parsed by Express into
 * an array) or as one comma-joined string — the form the frontend sends, since
 * axios's default array serialisation appends `[]` to the key.
 *
 * @param {string|string[]|undefined} raw
 * @returns {string[]} ids, empty when nothing usable was supplied
 */
const parseMotorcycleModelFilter = (raw) => {
  if (raw === undefined || raw === null) return [];

  const values = Array.isArray(raw) ? raw : String(raw).split(',');

  return values
    .map((value) => String(value).trim())
    .filter((value) => /^[0-9a-fA-F]{24}$/.test(value));
};

/**
 * Verifies every id in a fitment list refers to a real motorcycle model.
 *
 * Without this a typo'd id is stored happily and simply populates to nothing,
 * so the product silently claims to fit no motorcycle while the form shows a
 * saved change.
 *
 * @param {string[]|undefined} ids
 * @returns {Promise<{ ok: true, ids: string[] } | { ok: false, message: string }>}
 */
const validateMotorcycleModels = async (ids) => {
  if (ids === undefined) return { ok: true, ids: undefined };
  if (!Array.isArray(ids)) return { ok: true, ids: undefined };
  if (ids.length === 0) return { ok: true, ids: [] };

  const unique = [...new Set(ids.map((id) => String(id)))];
  const found = await MotorcycleModel.find({ _id: { $in: unique } }).select('_id').lean();

  if (found.length !== unique.length) {
    const foundIds = new Set(found.map((doc) => String(doc._id)));
    const missing = unique.filter((id) => !foundIds.has(id));
    return {
      ok: false,
      message: `Motorcycle model not found: ${missing.join(', ')}`
    };
  }

  return { ok: true, ids: unique };
};

/**
 * Find a product already holding this barcode, if any.
 *
 * The unique partial index on Product is what actually guarantees uniqueness;
 * this lookup exists to name the offending product in the error, because
 * "Barcode already exists" leaves an admin hunting through the catalog for it.
 *
 * A blank barcode is not a conflict — barcode is optional, and blanks are
 * normalised to absent so they never collide with each other.
 *
 * @param {string|null|undefined} barcode
 * @param {string} [excludeId] Product to ignore, so an edit does not conflict with itself.
 * @returns {Promise<Object|null>}
 */
const findBarcodeConflict = async (barcode, excludeId) => {
  if (barcode === null || barcode === undefined) return null;

  const trimmed = String(barcode).trim();
  if (trimmed === '') return null;

  const query = { barcode: trimmed };
  if (excludeId) query._id = { $ne: excludeId };

  return Product.findOne(query).select('sku name').lean();
};

const barcodeConflictMessage = (product) =>
  `Barcode already assigned to ${product.name} (${product.sku})`;

/**
 * @desc    Get all products with filters
 * @route   GET /api/products
 * @access  Private
 */
export const getProducts = asyncHandler(async (req, res) => {
  const {
    category,
    brand,
    motorcycleModel,
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

  // Several motorcycles match ANY of them, not all: a customer with a Click
  // 125i and a PCX wants the parts fitting either bike, not only the parts
  // that happen to fit both.
  const motorcycleModelIds = parseMotorcycleModelFilter(motorcycleModel);
  if (motorcycleModelIds.length > 0) {
    query.motorcycleModels = { $in: motorcycleModelIds };
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
      .populate('motorcycleModels', MOTORCYCLE_MODEL_SELECT)
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
export const getProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check cache
  const cacheKey = CacheUtil.generateKey('product', id);
  const cached = await CacheUtil.get(cacheKey);
  
  if (cached) {
    return ApiResponse.success(res, 200, 'Product retrieved from cache', cached);
  }

  const product = await Product.findById(id)
    .populate('category', 'name code color')
    .populate('motorcycleModels', MOTORCYCLE_MODEL_SELECT);

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
export const searchProducts = asyncHandler(async (req, res) => {
  const { q, motorcycleModel, limit = 10 } = req.query;

  const motorcycleModelIds = parseMotorcycleModelFilter(motorcycleModel);

  // A motorcycle filter on its own is a complete search — "show me everything
  // that fits this bike" needs no text — so the text requirement only applies
  // when no fitment was picked.
  if (!q && motorcycleModelIds.length === 0) {
    return ApiResponse.error(res, 400, 'Search query is required');
  }

  // Check cache
  const cacheKey = CacheUtil.generateKey(
    'products',
    'search',
    q ?? '',
    motorcycleModelIds.join(',') || 'any',
    limit
  );
  const cached = await CacheUtil.get(cacheKey);

  if (cached) {
    return ApiResponse.success(res, 200, 'Search results from cache', cached);
  }

  const query = { isActive: true };

  if (motorcycleModelIds.length > 0) {
    query.motorcycleModels = { $in: motorcycleModelIds };
  }

  if (q) {
    const pattern = { $regex: escapeRegex(q), $options: 'i' };

    // Mixed search: the same box resolves a part ("brake pad", a SKU, a
    // barcode) and a motorcycle ("Click 125i"). Motorcycles are resolved to
    // ids first, then folded into the same $or — a two-step that a single
    // query cannot express, since the text lives in another collection.
    const matchingMotorcycles = await MotorcycleModel.find({
      $or: [{ make: pattern }, { model: pattern }, { code: pattern }]
    })
      .select('_id')
      .lean();

    const textOr = [
      { name: pattern },
      { sku: pattern },
      { brand: pattern },
      { productModel: pattern },
      { barcode: pattern }
    ];

    if (matchingMotorcycles.length > 0) {
      textOr.push({ motorcycleModels: { $in: matchingMotorcycles.map((m) => m._id) } });
    }

    query.$or = textOr;
  }

  const products = await Product.find(query)
    .select('sku name brand productModel sellingPrice images category motorcycleModels')
    .populate('category', 'name code')
    .populate('motorcycleModels', MOTORCYCLE_MODEL_SELECT)
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
export const createProduct = asyncHandler(async (req, res) => {
  const {
    sku,
    name,
    description,
    category,
    brand,
    productModel,
    motorcycleModels,
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

  const fitment = await validateMotorcycleModels(motorcycleModels);
  if (!fitment.ok) {
    return ApiResponse.error(res, 404, fitment.message);
  }

  const barcodeConflict = await findBarcodeConflict(barcode);
  if (barcodeConflict) {
    return ApiResponse.error(res, 400, barcodeConflictMessage(barcodeConflict));
  }

  try {
    // Create product
    const product = await Product.create({
      sku,
      name,
      description,
      category,
      brand,
      productModel,
      motorcycleModels: fitment.ids,
      costPrice,
      sellingPrice,
      barcode,
      images,
      specifications,
      tags
    });

    const populatedProduct = await Product.findById(product._id)
      .populate('category', 'name code')
      .populate('motorcycleModels', MOTORCYCLE_MODEL_SELECT);

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
export const updateProduct = asyncHandler(async (req, res) => {
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

  // An empty array is a legitimate update ("this part fits nothing specific"),
  // so this checks for the key's presence rather than its truthiness.
  if ('motorcycleModels' in req.body) {
    const fitment = await validateMotorcycleModels(req.body.motorcycleModels);
    if (!fitment.ok) {
      return ApiResponse.error(res, 404, fitment.message);
    }
    req.body.motorcycleModels = fitment.ids ?? [];
  }

  // Excluding this product is what makes a no-op save work — re-submitting the
  // edit form without touching the barcode must not conflict with itself.
  const barcodeConflict = await findBarcodeConflict(req.body.barcode, id);
  if (barcodeConflict) {
    return ApiResponse.error(res, 400, barcodeConflictMessage(barcodeConflict));
  }

  try {
    // Update product
    product = await Product.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('category', 'name code')
      .populate('motorcycleModels', MOTORCYCLE_MODEL_SELECT);
  } catch (error) {
    // The check above loses to a concurrent write; the unique index does not.
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || error.keyValue || {})[0] || 'field';
      return ApiResponse.error(
        res,
        400,
        field === 'barcode'
          ? 'Another product already uses this barcode'
          : `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`
      );
    }
    throw error;
  }

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
export const deleteProduct = asyncHandler(async (req, res) => {
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

/**
 * @desc    Restore an archived product
 * @route   PATCH /api/products/:id/restore
 * @access  Private (Admin only)
 *
 * Clears both flags that `deleteProduct` sets. Clearing only `isActive` would
 * leave the product invisible in the catalog's default view and still refused
 * by the stock guard, which reads either flag — a restore that does not
 * actually restore.
 *
 * Idempotent: restoring an already-active product succeeds and changes nothing.
 */
export const restoreProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const product = await Product.findById(id);

  if (!product) {
    return ApiResponse.error(res, 404, 'Product not found');
  }

  product.isActive = true;
  product.isDiscontinued = false;
  await product.save();

  await CacheUtil.del(CacheUtil.generateKey('product', id));
  await CacheUtil.delPattern('cache:products:*');

  const populated = await Product.findById(id)
    .populate('category', 'name code color')
    .populate('motorcycleModels', MOTORCYCLE_MODEL_SELECT);

  return ApiResponse.success(res, 200, 'Product restored successfully', populated);
});

import { deleteImageFile, getFilenameFromUrl } from '../middleware/imageUpload.js';

/**
 * @desc    Add product image (via file upload)
 * @route   POST /api/products/:id/images
 * @access  Private (Admin only)
 * @note    Accepts FormData with 'image' field and optional 'isPrimary' field
 */
export const addProductImage = asyncHandler(async (req, res) => {
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
  await product.populate('motorcycleModels', MOTORCYCLE_MODEL_SELECT);

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('product', id));

  return ApiResponse.success(res, 201, 'Image uploaded successfully', product);
});

/**
 * @desc    Add product image via URL (legacy support)
 * @route   POST /api/products/:id/images/url
 * @access  Private (Admin only)
 */
export const addProductImageUrl = asyncHandler(async (req, res) => {
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
  await product.populate('motorcycleModels', MOTORCYCLE_MODEL_SELECT);

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('product', id));

  return ApiResponse.success(res, 201, 'Image added successfully', product);
});

/**
 * @desc    Delete product image
 * @route   DELETE /api/products/:id/images/:imageId
 * @access  Private (Admin only)
 */
export const deleteProductImage = asyncHandler(async (req, res) => {
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
  await product.populate('motorcycleModels', MOTORCYCLE_MODEL_SELECT);

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('product', id));

  return ApiResponse.success(res, 200, 'Image deleted successfully', product);
});
