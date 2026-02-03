# Phase 2: Branch Management Module

> **IMPORTANT**: Before implementing any feature in this phase, always refer back to [Planning.md](./Planning.md) and [README.md](../../README.md) to ensure alignment with system requirements and scope. This phase establishes the multi-branch infrastructure that is critical for the entire MVP.

---

## 🎯 Phase Objectives

Build the branch management system that enables multi-tenancy across different store locations. This includes:
- Branch model with comprehensive settings
- Branch CRUD operations with proper authorization
- Branch statistics and analytics endpoints
- Caching strategy for branch data
- Branch-specific access control integration

**Expected Outcome**: A fully functional multi-branch system where each branch can operate independently while maintaining centralized oversight.

---

## 📋 Pre-requisites

### Must Be Completed First ✅
- [x] **Phase 1: Core Infrastructure** - Must be 100% complete
  - ApiResponse utility
  - Cache utility
  - Constants file
  - Validation middleware
  - Branch access middleware
  - User model with branch field

### Required Services Running ✅
- MongoDB running on `localhost:27017`
- Redis running on `localhost:6379` (optional but recommended)
- Backend server running on `http://localhost:5000`

---

## 🛠️ Implementation Steps

### Step 1: Create Branch Model
**File**: `src/models/Branch.js`

**Purpose**: Define the schema for branch/store locations with comprehensive settings and validation.

**Implementation**:
```javascript
const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Branch name is required'],
      unique: true,
      trim: true,
      maxlength: [100, 'Branch name cannot exceed 100 characters']
    },
    code: {
      type: String,
      required: [true, 'Branch code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9-]+$/, 'Branch code must be alphanumeric with hyphens only'],
      maxlength: [20, 'Branch code cannot exceed 20 characters']
    },
    address: {
      street: {
        type: String,
        required: [true, 'Street address is required']
      },
      city: {
        type: String,
        required: [true, 'City is required']
      },
      province: {
        type: String,
        required: [true, 'Province is required']
      },
      postalCode: {
        type: String
      },
      country: {
        type: String,
        default: 'Philippines'
      }
    },
    contact: {
      phone: {
        type: String,
        required: [true, 'Phone number is required'],
        match: [/^[\d\s\-\+\(\)]+$/, 'Invalid phone number format']
      },
      email: {
        type: String,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Invalid email format']
      },
      fax: String
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    settings: {
      taxRate: {
        type: Number,
        default: 0,
        min: [0, 'Tax rate cannot be negative'],
        max: [100, 'Tax rate cannot exceed 100%']
      },
      currency: {
        type: String,
        default: 'PHP',
        enum: ['PHP', 'USD', 'EUR']
      },
      timezone: {
        type: String,
        default: 'Asia/Manila'
      },
      businessHours: {
        monday: { open: String, close: String },
        tuesday: { open: String, close: String },
        wednesday: { open: String, close: String },
        thursday: { open: String, close: String },
        friday: { open: String, close: String },
        saturday: { open: String, close: String },
        sunday: { open: String, close: String }
      },
      allowNegativeStock: {
        type: Boolean,
        default: false
      },
      lowStockThreshold: {
        type: Number,
        default: 10,
        min: [0, 'Threshold cannot be negative']
      }
    },
    isActive: {
      type: Boolean,
      default: true
    },
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters']
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes
branchSchema.index({ code: 1 });
branchSchema.index({ isActive: 1 });
branchSchema.index({ 'address.city': 1 });

// Virtual populate for staff count
branchSchema.virtual('staffCount', {
  ref: 'User',
  localField: '_id',
  foreignField: 'branch',
  count: true
});

// Method to get full address as string
branchSchema.methods.getFullAddress = function() {
  const addr = this.address;
  return `${addr.street}, ${addr.city}, ${addr.province} ${addr.postalCode || ''}, ${addr.country}`.trim();
};

const Branch = mongoose.model('Branch', branchSchema);

module.exports = Branch;
```

**Testing**:
```javascript
// Test in Node REPL or create test file
const Branch = require('./src/models/Branch');

// Create test branch
const branch = await Branch.create({
  name: 'Main Branch - Manila',
  code: 'MNL-001',
  address: {
    street: '123 EDSA Avenue',
    city: 'Manila',
    province: 'Metro Manila',
    postalCode: '1000'
  },
  contact: {
    phone: '+63 2 1234 5678',
    email: 'manila@motorparts.com'
  }
});

console.log(branch.getFullAddress());
// Should output: "123 EDSA Avenue, Manila, Metro Manila 1000, Philippines"
```

---

### Step 2: Create Branch Controller
**File**: `src/controllers/branchController.js`

**Purpose**: Handle all branch-related business logic and operations.

**Implementation**:
```javascript
const Branch = require('../models/Branch');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');
const CacheUtil = require('../utils/cache');
const { CACHE_TTL, USER_ROLES } = require('../config/constants');

/**
 * @desc    Get all branches
 * @route   GET /api/branches
 * @access  Private (All authenticated users)
 */
exports.getBranches = asyncHandler(async (req, res) => {
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
exports.getBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check cache
  const cacheKey = CacheUtil.generateKey('branch', id);
  const cached = await CacheUtil.get(cacheKey);
  
  if (cached) {
    return ApiResponse.success(res, 200, 'Branch retrieved from cache', cached);
  }

  const branch = await Branch.findById(id)
    .populate('manager', 'name email role')
    .populate('staffCount');

  if (!branch) {
    return ApiResponse.error(res, 404, 'Branch not found');
  }

  // Cache the result
  await CacheUtil.set(cacheKey, branch, CACHE_TTL.MEDIUM);

  return ApiResponse.success(res, 200, 'Branch retrieved successfully', branch);
});

/**
 * @desc    Create new branch
 * @route   POST /api/branches
 * @access  Private (Admin only)
 */
exports.createBranch = asyncHandler(async (req, res) => {
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
  await CacheUtil.delPattern('cache:branches:list:*');

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
exports.updateBranch = asyncHandler(async (req, res) => {
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

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('branch', id));
  await CacheUtil.delPattern('cache:branches:list:*');

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
exports.deleteBranch = asyncHandler(async (req, res) => {
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

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('branch', id));
  await CacheUtil.delPattern('cache:branches:list:*');

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
exports.getBranchStats = asyncHandler(async (req, res) => {
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
```

**Testing**:
```javascript
// Test getBranches
// GET http://localhost:5000/api/branches
// Expected: 200 with paginated list

// Test getBranch
// GET http://localhost:5000/api/branches/:id
// Expected: 200 with branch details

// Test createBranch
// POST http://localhost:5000/api/branches
// Body: { name, code, address, contact }
// Expected: 201 with created branch
```

---

### Step 3: Create Branch Routes
**File**: `src/routes/branchRoutes.js`

**Purpose**: Define API endpoints for branch operations with proper validation and authorization.

**Implementation**:
```javascript
const express = require('express');
const { body, param } = require('express-validator');
const {
  getBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
  getBranchStats
} = require('../controllers/branchController');
const { protect, authorize } = require('../middleware/auth');
const { checkBranchAccess } = require('../middleware/branchAccess');
const validate = require('../middleware/validate');
const cacheMiddleware = require('../middleware/cache');
const { USER_ROLES, CACHE_TTL } = require('../config/constants');

const router = express.Router();

// Validation chains
const branchIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid branch ID format'),
  validate
];

const createBranchValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Branch name is required')
    .isLength({ max: 100 }).withMessage('Branch name cannot exceed 100 characters'),
  body('code')
    .trim()
    .notEmpty().withMessage('Branch code is required')
    .isLength({ max: 20 }).withMessage('Branch code cannot exceed 20 characters')
    .matches(/^[A-Z0-9-]+$/).withMessage('Branch code must be uppercase alphanumeric with hyphens only'),
  body('address.street')
    .trim()
    .notEmpty().withMessage('Street address is required'),
  body('address.city')
    .trim()
    .notEmpty().withMessage('City is required'),
  body('address.province')
    .trim()
    .notEmpty().withMessage('Province is required'),
  body('contact.phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^[\d\s\-\+\(\)]+$/).withMessage('Invalid phone number format'),
  body('contact.email')
    .optional()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('manager')
    .optional()
    .isMongoId().withMessage('Invalid manager ID'),
  body('settings.taxRate')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100'),
  validate
];

const updateBranchValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid branch ID format'),
  body('name')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Branch name cannot exceed 100 characters'),
  body('code')
    .optional()
    .trim()
    .isLength({ max: 20 }).withMessage('Branch code cannot exceed 20 characters')
    .matches(/^[A-Z0-9-]+$/).withMessage('Branch code must be uppercase alphanumeric with hyphens only'),
  body('contact.email')
    .optional()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('manager')
    .optional()
    .isMongoId().withMessage('Invalid manager ID'),
  validate
];

// Public routes (require authentication only)
router.get(
  '/',
  protect,
  cacheMiddleware('branches', CACHE_TTL.LONG),
  getBranches
);

router.get(
  '/:id',
  protect,
  branchIdValidation,
  cacheMiddleware('branch', CACHE_TTL.MEDIUM),
  getBranch
);

router.get(
  '/:id/stats',
  protect,
  branchIdValidation,
  checkBranchAccess,
  getBranchStats
);

// Admin-only routes
router.post(
  '/',
  protect,
  authorize(USER_ROLES.ADMIN),
  createBranchValidation,
  createBranch
);

router.put(
  '/:id',
  protect,
  authorize(USER_ROLES.ADMIN),
  updateBranchValidation,
  updateBranch
);

router.delete(
  '/:id',
  protect,
  authorize(USER_ROLES.ADMIN),
  branchIdValidation,
  deleteBranch
);

module.exports = router;
```

---

### Step 4: Mount Branch Routes in Server
**File**: `src/server.js` (MODIFY EXISTING)

**Purpose**: Add branch routes to the Express application.

**Implementation** - Add this to the routes section:
```javascript
// Import branch routes (add at top with other imports)
const branchRoutes = require('./routes/branchRoutes');

// Mount branch routes (add after existing routes)
app.use('/api/branches', branchRoutes);
```

**Full route mounting section should look like:**
```javascript
// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/branches', branchRoutes); // NEW

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});
```

---

### Step 5: Update User Model Branch Validation
**File**: `src/models/User.js` (MODIFY EXISTING)

**Purpose**: Ensure branch validation works correctly with actual Branch model.

**Implementation** - Update the branch field validation:
```javascript
// Find the branch field in userSchema and update it to:
branch: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Branch',
  required: function() {
    // Branch is required for non-admin users
    return this.role !== 'admin';
  },
  validate: {
    validator: async function(branchId) {
      // Skip validation if no branchId (admin can have no branch)
      if (!branchId) return true;
      
      // Check if branch exists
      const Branch = require('./Branch');
      const branch = await Branch.findById(branchId);
      return branch !== null;
    },
    message: 'Branch does not exist'
  }
},
```

---

### Step 6: Create Initial Branches Seed Script (Optional)
**File**: `src/utils/seedBranches.js`

**Purpose**: Populate database with sample branches for testing.

**Implementation**:
```javascript
const mongoose = require('mongoose');
const Branch = require('../models/Branch');
require('dotenv').config();

const branches = [
  {
    name: 'Main Branch - Manila',
    code: 'MNL-MAIN',
    address: {
      street: '123 EDSA Avenue',
      city: 'Manila',
      province: 'Metro Manila',
      postalCode: '1000',
      country: 'Philippines'
    },
    contact: {
      phone: '+63 2 1234 5678',
      email: 'manila@motorparts.com'
    },
    settings: {
      taxRate: 12,
      currency: 'PHP',
      timezone: 'Asia/Manila',
      businessHours: {
        monday: { open: '08:00', close: '18:00' },
        tuesday: { open: '08:00', close: '18:00' },
        wednesday: { open: '08:00', close: '18:00' },
        thursday: { open: '08:00', close: '18:00' },
        friday: { open: '08:00', close: '18:00' },
        saturday: { open: '08:00', close: '17:00' },
        sunday: { open: '09:00', close: '15:00' }
      }
    },
    description: 'Main headquarters and flagship store'
  },
  {
    name: 'Quezon City Branch',
    code: 'QC-001',
    address: {
      street: '456 Commonwealth Avenue',
      city: 'Quezon City',
      province: 'Metro Manila',
      postalCode: '1100',
      country: 'Philippines'
    },
    contact: {
      phone: '+63 2 8765 4321',
      email: 'qc@motorparts.com'
    },
    settings: {
      taxRate: 12,
      currency: 'PHP',
      timezone: 'Asia/Manila',
      businessHours: {
        monday: { open: '08:00', close: '18:00' },
        tuesday: { open: '08:00', close: '18:00' },
        wednesday: { open: '08:00', close: '18:00' },
        thursday: { open: '08:00', close: '18:00' },
        friday: { open: '08:00', close: '18:00' },
        saturday: { open: '08:00', close: '17:00' },
        sunday: { open: null, close: null }
      }
    },
    description: 'Quezon City branch serving northern Metro Manila'
  },
  {
    name: 'Cebu Branch',
    code: 'CEB-001',
    address: {
      street: '789 Osmena Boulevard',
      city: 'Cebu City',
      province: 'Cebu',
      postalCode: '6000',
      country: 'Philippines'
    },
    contact: {
      phone: '+63 32 234 5678',
      email: 'cebu@motorparts.com'
    },
    settings: {
      taxRate: 12,
      currency: 'PHP',
      timezone: 'Asia/Manila',
      businessHours: {
        monday: { open: '08:00', close: '18:00' },
        tuesday: { open: '08:00', close: '18:00' },
        wednesday: { open: '08:00', close: '18:00' },
        thursday: { open: '08:00', close: '18:00' },
        friday: { open: '08:00', close: '18:00' },
        saturday: { open: '08:00', close: '17:00' },
        sunday: { open: null, close: null }
      }
    },
    description: 'Cebu branch serving Visayas region'
  }
];

const seedBranches = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing branches
    await Branch.deleteMany({});
    console.log('Cleared existing branches');

    // Insert new branches
    const createdBranches = await Branch.insertMany(branches);
    console.log(`✅ Seeded ${createdBranches.length} branches successfully`);
    
    createdBranches.forEach(branch => {
      console.log(`   - ${branch.name} (${branch.code})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding branches:', error);
    process.exit(1);
  }
};

seedBranches();
```

**Usage**:
```bash
node src/utils/seedBranches.js
```

---

## ✅ Phase 2 Completion Checklist

Before moving to Phase 3, ensure all of the following are complete:

### Files Created
- [ ] `src/models/Branch.js` - Branch model with full schema
- [ ] `src/controllers/branchController.js` - All 6 controller functions
- [ ] `src/routes/branchRoutes.js` - Branch routes with validation
- [ ] `src/utils/seedBranches.js` - Seed script (optional)

### Files Modified
- [ ] `src/server.js` - Branch routes mounted
- [ ] `src/models/User.js` - Branch field validation updated

### Functionality Testing
- [ ] Branch model saves correctly with all required fields
- [ ] Branch model validates code format (uppercase alphanumeric)
- [ ] Branch model prevents duplicate name/code
- [ ] Get all branches returns paginated results
- [ ] Get single branch returns full details with manager info
- [ ] Create branch requires admin authentication
- [ ] Create branch validates manager role (not customer)
- [ ] Update branch works with partial data
- [ ] Delete branch soft-deletes (sets isActive to false)
- [ ] Delete branch prevents deletion if users are assigned
- [ ] Branch stats endpoint returns correct counts
- [ ] Branch access middleware allows admin to access all branches
- [ ] Branch access middleware restricts non-admins to their branch only

### Cache Testing
- [ ] Branch list is cached after first request
- [ ] Single branch is cached after first request
- [ ] Cache is invalidated after create operation
- [ ] Cache is invalidated after update operation
- [ ] Cache is invalidated after delete operation

### Manual Testing Endpoints

Test these endpoints using Postman or similar tool:

```bash
# 1. Create admin user first (if not exists)
POST http://localhost:5000/api/auth/register
Body: {
  "name": "Admin User",
  "email": "admin@motorparts.com",
  "password": "admin123",
  "role": "admin"
}
# Save the access token

# 2. Create first branch
POST http://localhost:5000/api/branches
Headers: { "Authorization": "Bearer <admin_token>" }
Body: {
  "name": "Main Branch - Manila",
  "code": "MNL-MAIN",
  "address": {
    "street": "123 EDSA Avenue",
    "city": "Manila",
    "province": "Metro Manila",
    "postalCode": "1000"
  },
  "contact": {
    "phone": "+63 2 1234 5678",
    "email": "manila@motorparts.com"
  }
}
Expected: 201 with created branch data

# 3. Get all branches
GET http://localhost:5000/api/branches
Headers: { "Authorization": "Bearer <admin_token>" }
Expected: 200 with paginated list

# 4. Get single branch
GET http://localhost:5000/api/branches/:id
Headers: { "Authorization": "Bearer <admin_token>" }
Expected: 200 with branch details

# 5. Update branch
PUT http://localhost:5000/api/branches/:id
Headers: { "Authorization": "Bearer <admin_token>" }
Body: {
  "description": "Updated description"
}
Expected: 200 with updated branch

# 6. Get branch stats
GET http://localhost:5000/api/branches/:id/stats
Headers: { "Authorization": "Bearer <admin_token>" }
Expected: 200 with statistics

# 7. Try to delete branch (should fail if users assigned)
DELETE http://localhost:5000/api/branches/:id
Headers: { "Authorization": "Bearer <admin_token>" }
Expected: 400 if users exist, or 200 if branch is empty

# 8. Test validation - invalid code
POST http://localhost:5000/api/branches
Headers: { "Authorization": "Bearer <admin_token>" }
Body: {
  "name": "Test Branch",
  "code": "invalid code",  // Should fail - lowercase and spaces
  "address": { ... },
  "contact": { ... }
}
Expected: 400 with validation error

# 9. Test non-admin access
# Create a salesperson user, login, then try to create branch
Expected: 403 Forbidden
```

---

## 📊 Expected Outcomes

After completing Phase 2, you should have:

1. **Full Branch CRUD** - Create, read, update, delete branches
2. **Multi-branch Foundation** - Infrastructure for multi-tenancy
3. **Branch Statistics** - Staff counts and basic metrics
4. **Branch Access Control** - Users restricted to their assigned branch
5. **Cached Branch Data** - Improved performance with Redis caching
6. **Branch Validation** - Comprehensive input validation
7. **Soft Delete** - Branches are deactivated, not permanently deleted

---

## 🚀 Next Steps

Once Phase 2 is complete and all tests pass:

1. **Create Phase 2 Completion Document**:
   - Create file: `backend/Phase-2-done.md`
   - List all implemented features
   - Document any deviations from the plan
   - Include test results

2. **Proceed to Phase 3**: Product & Category Management
   - Phase 3 will use branches to organize products
   - Each product can have different stock levels per branch
   - Categories will help organize the product catalog

---

## 📝 Notes

- **Branch Code Format**: Always uppercase, alphanumeric with hyphens (e.g., MNL-001, QC-MAIN)
- **Soft Delete**: Branches are never hard-deleted to preserve historical data
- **Manager Assignment**: Only admin, salesperson, or mechanic can be managers (not customers)
- **Business Hours**: Can be null for closed days
- **Tax Rate**: Stored as percentage (12 means 12%)
- **Seed Script**: Use `seedBranches.js` to quickly populate test data

---

## ⚠️ Common Issues & Solutions

### Issue 1: Duplicate Branch Code Error
**Problem**: Error when creating branch with existing code
**Solution**: Branch codes must be unique. Check existing branches first or use different code

### Issue 2: Manager Validation Fails
**Problem**: Cannot assign manager to branch
**Solution**: Ensure manager user exists and has appropriate role (not customer)

### Issue 3: Branch Not Found After Creation
**Problem**: Get branch returns 404 immediately after creation
**Solution**: Ensure MongoDB connection is stable. Check if branch was actually saved

### Issue 4: Cache Not Invalidating
**Problem**: Old data returned after update
**Solution**: Verify Redis is running. Check cache keys match pattern in delPattern

### Issue 5: User Cannot Access Own Branch
**Problem**: Non-admin users get 403 when accessing their branch stats
**Solution**: Ensure user has `branch` field populated. Check `checkBranchAccess` middleware

---

## 📚 References

- [Planning.md](./Planning.md) - Phase 2 implementation details (lines 451-656)
- [README.md](../README.md) - Multi-tenancy features overview
- [Phase-1.md](./Phase-1.md) - Core infrastructure used in this phase
- [Mongoose Schema Docs](https://mongoosejs.com/docs/guide.html)
- [Express Validator](https://express-validator.github.io/docs/)

---

> **COMPLETION NOTE**: After successfully implementing and testing all features in Phase 2, create `Phase-2-done.md` to document your completion. Include all implemented features, test results, branch IDs created during testing, and any notes for future reference. Then proceed to `Phase-3.md` for Product & Category Management implementation.
