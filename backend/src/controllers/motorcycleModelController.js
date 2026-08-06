import MotorcycleModel from '../models/MotorcycleModel.js';
import Product from '../models/Product.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/apiResponse.js';
import CacheUtil from '../utils/cache.js';
import { CACHE_TTL } from '../config/constants.js';

/**
 * Escapes a user-supplied string so it can be used inside a RegExp literally.
 * Without this a search for "125i (2018)" is parsed as a group and either
 * throws or matches the wrong thing.
 */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Cache invalidation for this domain.
 *
 * Product reads embed populated motorcycle models, so renaming one leaves a
 * cached product detail showing the old label — hence `cache:product:*` is
 * cleared here too, not only the motorcycle-model keys.
 */
const invalidateMotorcycleModelCaches = async (id) => {
  if (id) {
    await CacheUtil.del(CacheUtil.generateKey('motorcycleModel', id));
  }
  await CacheUtil.delPattern('cache:motorcycleModels:*');
  await CacheUtil.delPattern('cache:product:*');
  await CacheUtil.delPattern('cache:products:*');
};

/**
 * @desc    Get all motorcycle models
 * @route   GET /api/motorcycle-models
 * @access  Private
 */
export const getMotorcycleModels = asyncHandler(async (req, res) => {
  const { make, active, search } = req.query;

  // Build query
  const query = {};

  if (make) {
    query.make = { $regex: `^${escapeRegex(make)}$`, $options: 'i' };
  }

  if (active !== undefined) {
    query.isActive = active === 'true';
  }

  if (search) {
    const pattern = { $regex: escapeRegex(search), $options: 'i' };
    query.$or = [{ make: pattern }, { model: pattern }, { code: pattern }];
  }

  // Check cache
  const cacheKey = CacheUtil.generateKey('motorcycleModels', 'list', JSON.stringify(query));
  const cached = await CacheUtil.get(cacheKey);

  if (cached) {
    return ApiResponse.success(res, 200, 'Motorcycle models retrieved from cache', cached);
  }

  const motorcycleModels = await MotorcycleModel.find(query)
    .sort({ make: 1, model: 1, yearFrom: 1 })
    .populate('productCount');

  // Cache the result
  await CacheUtil.set(cacheKey, motorcycleModels, CACHE_TTL.LONG);

  return ApiResponse.success(
    res,
    200,
    'Motorcycle models retrieved successfully',
    motorcycleModels
  );
});

/**
 * @desc    Get the distinct list of makes (for grouping and filter dropdowns)
 * @route   GET /api/motorcycle-models/makes
 * @access  Private
 */
export const getMotorcycleMakes = asyncHandler(async (req, res) => {
  const { active } = req.query;

  const query = {};
  if (active !== undefined) {
    query.isActive = active === 'true';
  }

  const makes = await MotorcycleModel.distinct('make', query);
  makes.sort((a, b) => a.localeCompare(b));

  return ApiResponse.success(res, 200, 'Motorcycle makes retrieved successfully', makes);
});

/**
 * @desc    Get single motorcycle model
 * @route   GET /api/motorcycle-models/:id
 * @access  Private
 */
export const getMotorcycleModel = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check cache
  const cacheKey = CacheUtil.generateKey('motorcycleModel', id);
  const cached = await CacheUtil.get(cacheKey);

  if (cached) {
    return ApiResponse.success(res, 200, 'Motorcycle model retrieved from cache', cached);
  }

  const motorcycleModel = await MotorcycleModel.findById(id).populate('productCount');

  if (!motorcycleModel) {
    return ApiResponse.error(res, 404, 'Motorcycle model not found');
  }

  await CacheUtil.set(cacheKey, motorcycleModel, CACHE_TTL.LONG);

  return ApiResponse.success(
    res,
    200,
    'Motorcycle model retrieved successfully',
    motorcycleModel
  );
});

/**
 * @desc    Create new motorcycle model
 * @route   POST /api/motorcycle-models
 * @access  Private (Admin only)
 */
export const createMotorcycleModel = asyncHandler(async (req, res) => {
  const { make, model, yearFrom, yearTo, description } = req.body;

  try {
    const motorcycleModel = await MotorcycleModel.create({
      make,
      model,
      yearFrom,
      yearTo,
      description
    });

    await invalidateMotorcycleModelCaches();

    return ApiResponse.success(
      res,
      201,
      'Motorcycle model created successfully',
      motorcycleModel
    );
  } catch (error) {
    // The unique `code` index is what actually enforces "no two identical
    // motorcycles"; a duplicate reaches here as a key collision on a derived
    // field, which is meaningless to the user, so it is reported in terms of
    // what they typed.
    if (error.code === 11000) {
      return ApiResponse.error(
        res,
        400,
        'A motorcycle model with the same make, model and year range already exists'
      );
    }
    throw error;
  }
});

/**
 * @desc    Update motorcycle model
 * @route   PUT /api/motorcycle-models/:id
 * @access  Private (Admin only)
 */
export const updateMotorcycleModel = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const motorcycleModel = await MotorcycleModel.findById(id);

  if (!motorcycleModel) {
    return ApiResponse.error(res, 404, 'Motorcycle model not found');
  }

  const { make, model, yearFrom, yearTo, description, isActive } = req.body;

  // set + save rather than findByIdAndUpdate: `code` is derived in a pre-save
  // hook, and the query-middleware path would never run it — a renamed model
  // would keep the old code and stay reachable under its previous identity.
  if (make !== undefined) motorcycleModel.make = make;
  if (model !== undefined) motorcycleModel.model = model;
  if (yearFrom !== undefined) motorcycleModel.yearFrom = yearFrom === null ? undefined : yearFrom;
  if (yearTo !== undefined) motorcycleModel.yearTo = yearTo === null ? undefined : yearTo;
  if (description !== undefined) motorcycleModel.description = description;
  if (isActive !== undefined) motorcycleModel.isActive = isActive;

  try {
    await motorcycleModel.save();
  } catch (error) {
    if (error.code === 11000) {
      return ApiResponse.error(
        res,
        400,
        'A motorcycle model with the same make, model and year range already exists'
      );
    }
    throw error;
  }

  await invalidateMotorcycleModelCaches(id);

  return ApiResponse.success(
    res,
    200,
    'Motorcycle model updated successfully',
    motorcycleModel
  );
});

/**
 * @desc    Deactivate motorcycle model (soft delete)
 * @route   DELETE /api/motorcycle-models/:id
 * @access  Private (Admin only)
 */
export const deleteMotorcycleModel = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const motorcycleModel = await MotorcycleModel.findById(id);

  if (!motorcycleModel) {
    return ApiResponse.error(res, 404, 'Motorcycle model not found');
  }

  // Same guard as categories: a motorcycle model still referenced by products
  // cannot be removed, or those products would show a dangling fitment.
  const productCount = await Product.countDocuments({ motorcycleModels: id });
  if (productCount > 0) {
    return ApiResponse.error(
      res,
      400,
      `Cannot delete motorcycle model. ${productCount} product(s) are assigned to it.`
    );
  }

  // Soft delete
  motorcycleModel.isActive = false;
  await motorcycleModel.save();

  await invalidateMotorcycleModelCaches(id);

  return ApiResponse.success(res, 200, 'Motorcycle model deactivated successfully', {
    id: motorcycleModel._id,
    displayName: motorcycleModel.displayName,
    isActive: false
  });
});
