import User from '../models/User.js';
import Branch from '../models/Branch.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/apiResponse.js';

// @desc    Get all users (paginated with filters)
// @route   GET /api/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
  const {
    search,
    role,
    branch,
    isActive,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  // Build query
  const query = {};

  // Search filter (name or email)
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  // Role filter
  if (role) {
    query.role = role;
  }

  // Branch filter
  if (branch) {
    query.branch = branch;
  }

  // Active status filter
  if (isActive !== undefined && isActive !== '') {
    query.isActive = isActive === 'true';
  }

  // Pagination
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  // Sort
  const sortOptions = {};
  const allowedSortFields = ['name', 'email', 'role', 'createdAt', 'updatedAt', 'isActive'];
  const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
  sortOptions[sortField] = sortOrder === 'asc' ? 1 : -1;

  // Execute query
  const [users, total] = await Promise.all([
    User.find(query)
      .select('-password -refreshToken -passwordResetToken -passwordResetExpires')
      .populate('branch', 'name code')
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum),
    User.countDocuments(query),
  ]);

  return ApiResponse.paginate(
    res,
    users,
    pageNum,
    limitNum,
    total,
    'Users retrieved successfully'
  );
});

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private/Admin
const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('-password -refreshToken -passwordResetToken -passwordResetExpires')
    .populate('branch', 'name code');

  if (!user) {
    return ApiResponse.error(res, 404, 'User not found');
  }

  return ApiResponse.success(res, 200, 'User retrieved successfully', user);
});

// @desc    Create new user
// @route   POST /api/users
// @access  Private/Admin
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, branch } = req.body;

  // Check if user exists
  const userExists = await User.findOne({ email: email.toLowerCase() });
  if (userExists) {
    return ApiResponse.error(res, 400, 'User with this email already exists');
  }

  // Validate role (don't allow creating customers via admin panel)
  const validRoles = ['admin', 'salesperson', 'mechanic'];
  const userRole = role || 'salesperson';
  if (!validRoles.includes(userRole)) {
    return ApiResponse.error(res, 400, 'Invalid role. Must be admin, salesperson, or mechanic');
  }

  // Validate branch for salesperson/mechanic
  if ((userRole === 'salesperson' || userRole === 'mechanic') && !branch) {
    return ApiResponse.error(res, 400, 'Branch is required for salesperson and mechanic roles');
  }

  // Validate branch exists if provided
  if (branch) {
    const branchExists = await Branch.findById(branch);
    if (!branchExists) {
      return ApiResponse.error(res, 404, 'Branch not found');
    }
    if (!branchExists.isActive) {
      return ApiResponse.error(res, 400, 'Cannot assign user to an inactive branch');
    }
  }

  // Create user
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    role: userRole,
    branch: branch || undefined,
    isActive: true,
  });

  // Populate branch for response
  const populatedUser = await User.findById(user._id)
    .select('-password -refreshToken -passwordResetToken -passwordResetExpires')
    .populate('branch', 'name code');

  return ApiResponse.success(res, 201, 'User created successfully', populatedUser);
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = asyncHandler(async (req, res) => {
  const { name, email, role, branch } = req.body;
  const userId = req.params.id;
  const currentUserId = req.user._id.toString();

  const user = await User.findById(userId);
  if (!user) {
    return ApiResponse.error(res, 404, 'User not found');
  }

  // Self-protection: Cannot change own role
  if (userId === currentUserId && role && role !== user.role) {
    return ApiResponse.error(res, 400, 'Cannot change your own role');
  }

  // Validate role if provided
  if (role) {
    const validRoles = ['admin', 'salesperson', 'mechanic'];
    if (!validRoles.includes(role)) {
      return ApiResponse.error(res, 400, 'Invalid role. Must be admin, salesperson, or mechanic');
    }
  }

  // Validate email uniqueness (if changing)
  if (email && email.toLowerCase() !== user.email) {
    const emailExists = await User.findOne({
      email: email.toLowerCase(),
      _id: { $ne: userId },
    });
    if (emailExists) {
      return ApiResponse.error(res, 400, 'Email already in use');
    }
  }

  // Determine final role
  const finalRole = role || user.role;

  // Validate branch for salesperson/mechanic
  // Check if we're changing TO a role that needs a branch
  if (role && (role === 'salesperson' || role === 'mechanic')) {
    // If branch not provided in request AND user doesn't already have a branch, error
    if (!branch && !user.branch) {
      return ApiResponse.error(res, 400, 'Branch is required for salesperson and mechanic roles');
    }
  }
  
  // Also validate if existing role needs branch and it would be removed
  const finalBranch = branch !== undefined ? branch : user.branch;
  if ((finalRole === 'salesperson' || finalRole === 'mechanic') && !finalBranch) {
    return ApiResponse.error(res, 400, 'Branch is required for salesperson and mechanic roles');
  }

  // Validate branch exists if provided
  if (branch) {
    const branchExists = await Branch.findById(branch);
    if (!branchExists) {
      return ApiResponse.error(res, 404, 'Branch not found');
    }
    if (!branchExists.isActive) {
      return ApiResponse.error(res, 400, 'Cannot assign user to an inactive branch');
    }
  }

  // Update fields
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email.toLowerCase();
  if (role !== undefined) user.role = role;
  if (branch !== undefined) user.branch = branch || undefined;

  await user.save();

  // Populate branch for response
  const populatedUser = await User.findById(user._id)
    .select('-password -refreshToken -passwordResetToken -passwordResetExpires')
    .populate('branch', 'name code');

  return ApiResponse.success(res, 200, 'User updated successfully', populatedUser);
});

// @desc    Deactivate user
// @route   PATCH /api/users/:id/deactivate
// @access  Private/Admin
const deactivateUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const currentUserId = req.user._id.toString();

  const user = await User.findById(userId);
  if (!user) {
    return ApiResponse.error(res, 404, 'User not found');
  }

  // Self-protection: Cannot deactivate own account
  if (userId === currentUserId) {
    return ApiResponse.error(res, 400, 'Cannot deactivate your own account');
  }

  // Check if already deactivated
  if (!user.isActive) {
    return ApiResponse.error(res, 400, 'User is already deactivated');
  }

  // Deactivate user
  user.isActive = false;
  // Clear refresh token to force logout
  user.refreshToken = undefined;

  await user.save();

  // Populate branch for response
  const populatedUser = await User.findById(user._id)
    .select('-password -refreshToken -passwordResetToken -passwordResetExpires')
    .populate('branch', 'name code');

  return ApiResponse.success(res, 200, 'User deactivated successfully', populatedUser);
});

// @desc    Activate user
// @route   PATCH /api/users/:id/activate
// @access  Private/Admin
const activateUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;

  const user = await User.findById(userId);
  if (!user) {
    return ApiResponse.error(res, 404, 'User not found');
  }

  // Check if already active
  if (user.isActive) {
    return ApiResponse.error(res, 400, 'User is already active');
  }

  // Activate user
  user.isActive = true;

  await user.save();

  // Populate branch for response
  const populatedUser = await User.findById(user._id)
    .select('-password -refreshToken -passwordResetToken -passwordResetExpires')
    .populate('branch', 'name code');

  return ApiResponse.success(res, 200, 'User activated successfully', populatedUser);
});

// @desc    Change user password (admin)
// @route   PATCH /api/users/:id/password
// @access  Private/Admin
const changeUserPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  const userId = req.params.id;

  const user = await User.findById(userId);
  if (!user) {
    return ApiResponse.error(res, 404, 'User not found');
  }

  // Update password (will be hashed by pre-save hook)
  user.password = newPassword;
  // Clear refresh token to force re-login
  user.refreshToken = undefined;

  await user.save();

  return ApiResponse.success(res, 200, 'Password changed successfully. User will need to login again.');
});

export {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deactivateUser,
  activateUser,
  changeUserPassword
};
