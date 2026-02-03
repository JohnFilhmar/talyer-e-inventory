const Supplier = require('../models/Supplier');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');
const CacheUtil = require('../utils/cache');
const { CACHE_TTL, PAGINATION } = require('../config/constants');

/**
 * @desc    Get all suppliers
 * @route   GET /api/suppliers
 * @access  Private (Admin, Salesperson)
 */
exports.getSuppliers = asyncHandler(async (req, res) => {
  const { active, search, page = 1, limit = PAGINATION.DEFAULT_LIMIT } = req.query;

  const query = {};
  
  if (active !== undefined) {
    query.isActive = active === 'true';
  }
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } }
    ];
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const [suppliers, total] = await Promise.all([
    Supplier.find(query)
      .select('-__v')
      .sort({ name: 1 })
      .skip(skip)
      .limit(limitNum),
    Supplier.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    suppliers,
    pageNum,
    limitNum,
    total,
    'Suppliers retrieved successfully'
  );
});

/**
 * @desc    Get single supplier
 * @route   GET /api/suppliers/:id
 * @access  Private (Admin, Salesperson)
 */
exports.getSupplier = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const supplier = await Supplier.findById(id);

  if (!supplier) {
    return ApiResponse.error(res, 404, 'Supplier not found');
  }

  return ApiResponse.success(res, 200, 'Supplier retrieved successfully', supplier);
});

/**
 * @desc    Create new supplier
 * @route   POST /api/suppliers
 * @access  Private (Admin only)
 */
exports.createSupplier = asyncHandler(async (req, res) => {
  try {
    const supplier = await Supplier.create(req.body);

    return ApiResponse.success(res, 201, 'Supplier created successfully', supplier);
  } catch (error) {
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return ApiResponse.error(res, 400, errors.join(', '));
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return ApiResponse.error(res, 400, `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`);
    }
    throw error;
  }
});

/**
 * @desc    Update supplier
 * @route   PUT /api/suppliers/:id
 * @access  Private (Admin only)
 */
exports.updateSupplier = asyncHandler(async (req, res) => {
  try {
    let supplier = await Supplier.findById(req.params.id);

    if (!supplier) {
      return ApiResponse.error(res, 404, 'Supplier not found');
    }

    supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    return ApiResponse.success(res, 200, 'Supplier updated successfully', supplier);
  } catch (error) {
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return ApiResponse.error(res, 400, errors.join(', '));
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return ApiResponse.error(res, 400, `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`);
    }
    throw error;
  }
});

/**
 * @desc    Delete supplier (soft delete)
 * @route   DELETE /api/suppliers/:id
 * @access  Private (Admin only)
 */
exports.deleteSupplier = asyncHandler(async (req, res) => {
  const supplier = await Supplier.findById(req.params.id);

  if (!supplier) {
    return ApiResponse.error(res, 404, 'Supplier not found');
  }

  supplier.isActive = false;
  await supplier.save();

  return ApiResponse.success(
    res,
    200,
    'Supplier deactivated successfully',
    { id: supplier._id, name: supplier.name, isActive: false }
  );
});
