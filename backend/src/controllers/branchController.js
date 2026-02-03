import Branch from '../models/Branch.js';
import User from '../models/User.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/apiResponse.js';
import CacheUtil from '../utils/cache.js';
import { CACHE_TTL, USER_ROLES } from '../config/constants.js';

/**
 * @desc    Get all branches
 * @route   GET /api/branches
 * @access  Private (All authenticated users)
 */
export const getBranches = asyncHandler(async (req, res) => {
  const { active, city, search, page = 1, limit = 20 } = req.query;

  // Build query
  const query = {};
  
  if (active !== undefined) {
    query.isActive = active === 'true';
  }
  
  if (city) {
    query['address.city'] = { $regex: city, $options: 'i' };
  }
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } }
    ];
  }

  // Check cache first
  const cacheKey = CacheUtil.generateKey('branches', 'list', JSON.stringify(query), page, limit);
  const cached = await CacheUtil.get(cacheKey);
  
  if (cached) {
    return ApiResponse.paginate(
      res,
      cached.branches,
      cached.page,
      cached.limit,
      cached.total,
      'Branches retrieved from cache'
    );
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Execute query
  const [branches, total] = await Promise.all([
    Branch.find(query)
      .populate('manager', 'name email')
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 }),
    Branch.countDocuments(query)
  ]);

  // Cache the result
  await CacheUtil.set(
    cacheKey,
    { branches, page: pageNum, limit: limitNum, total },
    CACHE_TTL.LONG
  );

  return ApiResponse.paginate(
    res,
    branches,
    pageNum,
    limitNum,
    total,
    'Branches retrieved successfully'
  );
});

/**
 * @desc    Get single branch
 * @route   GET /api/branches/:id
 * @access  Private (All authenticated users)
 */
export const getBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const branch = await Branch.findById(id)
    .populate('manager', 'name email role')
    .populate('staffCount');

  if (!branch) {
    return ApiResponse.error(res, 404, 'Branch not found');
  }

  return ApiResponse.success(res, 200, 'Branch retrieved successfully', branch);
});

/**
 * @desc    Create new branch
 * @route   POST /api/branches
 * @access  Private (Admin only)
 */
export const createBranch = asyncHandler(async (req, res) => {
  const {
    name,
    code,
    address,
    contact,
    manager,
    settings,
    description
  } = req.body;

  // Check if manager exists and has appropriate role
  if (manager) {
    const managerUser = await User.findById(manager);
    if (!managerUser) {
      return ApiResponse.error(res, 404, 'Manager user not found');
    }
    if (managerUser.role === USER_ROLES.CUSTOMER) {
      return ApiResponse.error(res, 400, 'Customer cannot be assigned as branch manager');
    }
  }

  // Create branch
  const branch = await Branch.create({
    name,
    code,
    address,
    contact,
    manager,
    settings,
    description
  });

  // Invalidate branches list cache
  await CacheUtil.delPattern('cache:branches:*');

  return ApiResponse.success(
    res,
    201,
    'Branch created successfully',
    branch
  );
});

/**
 * @desc    Update branch
 * @route   PUT /api/branches/:id
 * @access  Private (Admin only)
 */
export const updateBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let branch = await Branch.findById(id);

  if (!branch) {
    return ApiResponse.error(res, 404, 'Branch not found');
  }

  // Check if new manager exists
  if (req.body.manager) {
    const managerUser = await User.findById(req.body.manager);
    if (!managerUser) {
      return ApiResponse.error(res, 404, 'Manager user not found');
    }
    if (managerUser.role === USER_ROLES.CUSTOMER) {
      return ApiResponse.error(res, 400, 'Customer cannot be assigned as branch manager');
    }
  }

  // Update branch
  branch = await Branch.findByIdAndUpdate(
    id,
    req.body,
    { new: true, runValidators: true }
  ).populate('manager', 'name email role');

  // Invalidate cache - both internal and middleware caches
  await CacheUtil.del(CacheUtil.generateKey('branch', id));
  await CacheUtil.del(CacheUtil.generateKey('branch', `/api/branches/${id}`));
  await CacheUtil.delPattern('cache:branches:*');

  return ApiResponse.success(
    res,
    200,
    'Branch updated successfully',
    branch
  );
});

/**
 * @desc    Delete branch
 * @route   DELETE /api/branches/:id
 * @access  Private (Admin only)
 */
export const deleteBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const branch = await Branch.findById(id);

  if (!branch) {
    return ApiResponse.error(res, 404, 'Branch not found');
  }

  // Check if branch has associated users
  const userCount = await User.countDocuments({ branch: id });
  if (userCount > 0) {
    return ApiResponse.error(
      res,
      400,
      `Cannot delete branch. ${userCount} user(s) are assigned to this branch. Please reassign them first.`
    );
  }

  // Soft delete by setting isActive to false
  branch.isActive = false;
  await branch.save();

  // Invalidate cache - both internal and middleware caches
  await CacheUtil.del(CacheUtil.generateKey('branch', id));
  await CacheUtil.del(CacheUtil.generateKey('branch', `/api/branches/${id}`));
  await CacheUtil.delPattern('cache:branches:*');

  return ApiResponse.success(
    res,
    200,
    'Branch deactivated successfully',
    { id: branch._id, name: branch.name, isActive: false }
  );
});

/**
 * @desc    Get branch statistics
 * @route   GET /api/branches/:id/stats
 * @access  Private (Admin, Branch Manager)
 */
export const getBranchStats = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const branch = await Branch.findById(id);

  if (!branch) {
    return ApiResponse.error(res, 404, 'Branch not found');
  }

  // Check cache
  const cacheKey = CacheUtil.generateKey('branch', id, 'stats');
  const cached = await CacheUtil.get(cacheKey);
  
  if (cached) {
    return ApiResponse.success(res, 200, 'Branch statistics retrieved from cache', cached);
  }

  // Get statistics
  const [staffCount, activeStaffCount] = await Promise.all([
    User.countDocuments({ branch: id }),
    User.countDocuments({ branch: id, isActive: true })
  ]);

  const stats = {
    branch: {
      id: branch._id,
      name: branch.name,
      code: branch.code
    },
    staff: {
      total: staffCount,
      active: activeStaffCount,
      inactive: staffCount - activeStaffCount
    },
    // Additional stats will be added in later phases (products, sales, etc.)
    inventory: {
      totalProducts: 0, // To be implemented in Phase 4
      lowStockItems: 0   // To be implemented in Phase 4
    },
    sales: {
      totalOrders: 0,    // To be implemented in Phase 5
      totalRevenue: 0    // To be implemented in Phase 5
    }
  };

  // Cache the result for 5 minutes
  await CacheUtil.set(cacheKey, stats, CACHE_TTL.SHORT);

  return ApiResponse.success(
    res,
    200,
    'Branch statistics retrieved successfully',
    stats
  );
});
