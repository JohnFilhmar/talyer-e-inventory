import Category from '../models/Category.js';
import Product from '../models/Product.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/apiResponse.js';
import CacheUtil from '../utils/cache.js';
import { CACHE_TTL } from '../config/constants.js';

/**
 * @desc    Get all categories
 * @route   GET /api/categories
 * @access  Private
 */
export const getCategories = asyncHandler(async (req, res) => {
  const { parent, active, includeChildren } = req.query;

  // Build query
  const query = {};
  
  if (parent !== undefined) {
    query.parent = parent === 'null' ? null : parent;
  }
  
  if (active !== undefined) {
    query.isActive = active === 'true';
  }

  // Check cache
  const cacheKey = CacheUtil.generateKey('categories', 'list', JSON.stringify(query));
  const cached = await CacheUtil.get(cacheKey);
  
  if (cached) {
    return ApiResponse.success(res, 200, 'Categories retrieved from cache', cached);
  }

  // Execute query
  let categoriesQuery = Category.find(query).sort({ sortOrder: 1, name: 1 });
  
  if (includeChildren === 'true') {
    categoriesQuery = categoriesQuery.populate('children');
  }
  
  const categories = await categoriesQuery.populate('productCount');

  // Cache the result
  await CacheUtil.set(cacheKey, categories, CACHE_TTL.LONG);

  return ApiResponse.success(res, 200, 'Categories retrieved successfully', categories);
});

/**
 * @desc    Get single category
 * @route   GET /api/categories/:id
 * @access  Private
 */
export const getCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check cache
  const cacheKey = CacheUtil.generateKey('category', id);
  const cached = await CacheUtil.get(cacheKey);
  
  if (cached) {
    return ApiResponse.success(res, 200, 'Category retrieved from cache', cached);
  }

  const category = await Category.findById(id)
    .populate('parent', 'name code')
    .populate('children')
    .populate('productCount');

  if (!category) {
    return ApiResponse.error(res, 404, 'Category not found');
  }

  // Get full path
  const fullPath = await category.getFullPath();
  const categoryData = category.toObject();
  categoryData.fullPath = fullPath;

  // Cache the result
  await CacheUtil.set(cacheKey, categoryData, CACHE_TTL.LONG);

  return ApiResponse.success(res, 200, 'Category retrieved successfully', categoryData);
});

/**
 * @desc    Get category children (subcategories)
 * @route   GET /api/categories/:id/children
 * @access  Private
 */
export const getCategoryChildren = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const children = await Category.find({ parent: id, isActive: true })
    .sort({ sortOrder: 1, name: 1 })
    .populate('productCount');

  return ApiResponse.success(
    res,
    200,
    'Subcategories retrieved successfully',
    children
  );
});

/**
 * @desc    Create new category
 * @route   POST /api/categories
 * @access  Private (Admin only)
 */
export const createCategory = asyncHandler(async (req, res) => {
  const { name, code, description, parent, image, color, sortOrder } = req.body;

  // If parent is provided, check if it exists
  if (parent) {
    const parentCategory = await Category.findById(parent);
    if (!parentCategory) {
      return ApiResponse.error(res, 404, 'Parent category not found');
    }
  }

  try {
    // Create category
    const category = await Category.create({
      name,
      code,
      description,
      parent,
      image,
      color,
      sortOrder
    });

    // Invalidate cache
    await CacheUtil.delPattern('cache:categories:*');

    return ApiResponse.success(res, 201, 'Category created successfully', category);
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
 * @desc    Update category
 * @route   PUT /api/categories/:id
 * @access  Private (Admin only)
 */
export const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let category = await Category.findById(id);

  if (!category) {
    return ApiResponse.error(res, 404, 'Category not found');
  }

  // Check if new parent is valid
  if (req.body.parent) {
    // Cannot set self as parent
    if (req.body.parent === id) {
      return ApiResponse.error(res, 400, 'Category cannot be its own parent');
    }
    
    const parentCategory = await Category.findById(req.body.parent);
    if (!parentCategory) {
      return ApiResponse.error(res, 404, 'Parent category not found');
    }
  }

  // Update category
  category = await Category.findByIdAndUpdate(
    id,
    req.body,
    { new: true, runValidators: true }
  ).populate('parent', 'name code');

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('category', id));
  await CacheUtil.delPattern('cache:categories:*');

  return ApiResponse.success(res, 200, 'Category updated successfully', category);
});

/**
 * @desc    Delete category
 * @route   DELETE /api/categories/:id
 * @access  Private (Admin only)
 */
export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const category = await Category.findById(id);

  if (!category) {
    return ApiResponse.error(res, 404, 'Category not found');
  }

  // Check if category has products
  const productCount = await Product.countDocuments({ category: id });
  if (productCount > 0) {
    return ApiResponse.error(
      res,
      400,
      `Cannot delete category. ${productCount} product(s) are assigned to this category.`
    );
  }

  // Check if category has children
  const childrenCount = await Category.countDocuments({ parent: id });
  if (childrenCount > 0) {
    return ApiResponse.error(
      res,
      400,
      `Cannot delete category. It has ${childrenCount} subcategories.`
    );
  }

  // Soft delete
  category.isActive = false;
  await category.save();

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('category', id));
  await CacheUtil.delPattern('cache:categories:*');

  return ApiResponse.success(
    res,
    200,
    'Category deactivated successfully',
    { id: category._id, name: category.name, isActive: false }
  );
});
