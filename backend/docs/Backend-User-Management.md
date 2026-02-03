# Backend User Management Implementation Plan

**Feature:** User Management API (Admin Exclusive)  
**Priority:** High (Security & Operations)  
**Estimated Effort:** 1-2 days  
**Dependencies:** Phase 1 (Authentication) Complete

---

## Table of Contents

1. [Overview](#overview)
2. [Existing Resources Analysis](#existing-resources-analysis)
3. [API Endpoints Specification](#api-endpoints-specification)
4. [Implementation Tasks](#implementation-tasks)
5. [Implementation Checklist](#implementation-checklist)
6. [Test Cases](#test-cases)

---

## Overview

This document covers the **backend API implementation** for User Management. All endpoints are admin-only and enable:

- Listing users with pagination, search, and filtering
- Creating new staff users with branch assignment
- Updating user details, role, and branch
- Activating/deactivating user accounts (with auto-logout)
- Changing user passwords (admin reset)

### Security Notes

The following security measures are **already implemented**:

| Security Check | Location | Status |
|----------------|----------|--------|
| `isActive` check on protected routes | `middleware/auth.js` line 26-30 | ✅ |
| `isActive` check on login | `controllers/authController.js` login | ✅ |
| `isActive` check on token refresh | `controllers/authController.js` refreshToken | ✅ |
| Admin-only route protection | `routes/userRoutes.js` | ✅ |

---

## Existing Resources Analysis

### ✅ Already Implemented

| Resource | File | Notes |
|----------|------|-------|
| User Model | `models/User.js` | Complete with `isActive`, `role`, `branch`, `permissions` |
| User Controller | `controllers/userController.js` | Basic CRUD exists, needs enhancement |
| User Routes | `routes/userRoutes.js` | Admin-protected routes configured |
| Auth Middleware | `middleware/auth.js` | `protect` + `authorize` middleware |

### Current User Model Schema

```javascript
{
  name: String (required),
  email: String (required, unique),
  password: String (required, hashed),
  role: enum ['admin', 'salesperson', 'mechanic', 'customer'],
  branch: ObjectId (ref: Branch),
  isActive: Boolean (default: true),
  permissions: [String],
  refreshToken: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
  timestamps: true
}
```

### Current Controller Methods

| Method | Status | Changes Needed |
|--------|--------|----------------|
| `getUsers` | ✅ Exists | Add pagination, search, filters |
| `getUser` | ✅ Exists | Add branch population |
| `createUser` | ✅ Exists | Add branch validation |
| `updateUser` | ✅ Exists | Add self-protection, branch validation |
| `deleteUser` | ✅ Exists | Keep as-is (hard delete) |

---

## API Endpoints Specification

### Base URL: `/api/users`

All endpoints require:
- Authentication: Bearer token (JWT)
- Authorization: `admin` role only

---

### 1. GET `/api/users` - List Users (Paginated)

**Purpose:** Retrieve paginated list of users with optional filters

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `search` | string | - | Search by name or email (case-insensitive) |
| `role` | string | - | Filter by role: admin, salesperson, mechanic, customer |
| `branch` | string | - | Filter by branch ID |
| `isActive` | string | - | Filter by status: 'true' or 'false' |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `sortBy` | string | 'createdAt' | Sort field |
| `sortOrder` | string | 'desc' | Sort order: 'asc' or 'desc' |

**Response (200):**

```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": [
    {
      "_id": "...",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "salesperson",
      "branch": {
        "_id": "...",
        "name": "Main Branch",
        "code": "MB001"
      },
      "isActive": true,
      "createdAt": "2026-01-15T10:30:00.000Z",
      "updatedAt": "2026-01-20T14:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

### 2. GET `/api/users/:id` - Get Single User

**Purpose:** Retrieve a single user by ID with populated branch

**Response (200):**

```json
{
  "success": true,
  "message": "User retrieved successfully",
  "data": {
    "_id": "...",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "salesperson",
    "branch": {
      "_id": "...",
      "name": "Main Branch",
      "code": "MB001"
    },
    "isActive": true,
    "permissions": [],
    "createdAt": "2026-01-15T10:30:00.000Z",
    "updatedAt": "2026-01-20T14:00:00.000Z"
  }
}
```

**Error Responses:**
- `404` - User not found

---

### 3. POST `/api/users` - Create User

**Purpose:** Create a new user account

**Request Body:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "role": "salesperson",
  "branch": "branch_id_here"
}
```

**Validation Rules:**

| Field | Rules |
|-------|-------|
| `name` | Required, min 2 characters |
| `email` | Required, valid email format, unique |
| `password` | Required, min 6 characters |
| `role` | Required, enum: admin, salesperson, mechanic (not customer) |
| `branch` | Required if role is `salesperson` or `mechanic` |

**Response (201):**

```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "_id": "...",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "salesperson",
    "branch": {
      "_id": "...",
      "name": "Main Branch",
      "code": "MB001"
    },
    "isActive": true,
    "createdAt": "2026-02-03T10:00:00.000Z"
  }
}
```

**Error Responses:**
- `400` - Validation error (missing fields, invalid email, etc.)
- `400` - User already exists (email)
- `400` - Branch is required for salesperson/mechanic
- `404` - Branch not found

---

### 4. PUT `/api/users/:id` - Update User

**Purpose:** Update user details

**Request Body (all fields optional):**

```json
{
  "name": "John Smith",
  "email": "john.smith@example.com",
  "role": "mechanic",
  "branch": "new_branch_id",
  "isActive": true
}
```

**Validation Rules:**

| Field | Rules |
|-------|-------|
| `name` | Min 2 characters if provided |
| `email` | Valid email format, unique (excluding current user) |
| `role` | Cannot change own role (self-protection) |
| `branch` | Required if role becomes `salesperson` or `mechanic` |
| `isActive` | Cannot deactivate own account (self-protection) |

**Response (200):**

```json
{
  "success": true,
  "message": "User updated successfully",
  "data": { /* updated user object */ }
}
```

**Error Responses:**
- `400` - Cannot change your own role
- `400` - Cannot deactivate your own account
- `400` - Email already in use
- `400` - Branch is required for salesperson/mechanic
- `404` - User not found
- `404` - Branch not found

---

### 5. PATCH `/api/users/:id/toggle-active` - Toggle Active Status (NEW)

**Purpose:** Toggle user's active status (activate/deactivate)

**Request Body:** None required

**Behavior:**
- Flips `isActive` from `true` to `false` or vice versa
- When deactivating: clears `refreshToken` to force logout
- Cannot toggle own account

**Response (200):**

```json
{
  "success": true,
  "message": "User deactivated successfully",
  "data": {
    "_id": "...",
    "name": "John Doe",
    "email": "john@example.com",
    "isActive": false,
    /* ... other fields ... */
  }
}
```

**Error Responses:**
- `400` - Cannot toggle your own account status
- `404` - User not found

---

### 6. PATCH `/api/users/:id/password` - Change Password (NEW)

**Purpose:** Admin resets/changes a user's password

**Request Body:**

```json
{
  "newPassword": "newSecurePassword123"
}
```

**Validation Rules:**

| Field | Rules |
|-------|-------|
| `newPassword` | Required, min 6 characters |

**Behavior:**
- Updates password (hashed by pre-save hook)
- Clears `refreshToken` to force re-login with new password

**Response (200):**

```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Error Responses:**
- `400` - Password must be at least 6 characters
- `404` - User not found

---

### 7. DELETE `/api/users/:id` - Delete User

**Purpose:** Permanently delete a user (existing endpoint)

**Note:** Consider using deactivation (`toggle-active`) instead for data preservation.

**Response (200):**

```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

**Error Responses:**
- `404` - User not found

---

## Implementation Tasks

### Task B1: Update `getUsers` - Add Pagination & Filters

**File:** `controllers/userController.js`

**Changes:**
```javascript
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
  if (isActive !== undefined) {
    query.isActive = isActive === 'true';
  }

  // Pagination
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  // Sort
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

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

  return ApiResponse.successPaginated(
    res,
    200,
    'Users retrieved successfully',
    users,
    {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    }
  );
});
```

---

### Task B2: Update `getUser` - Add Branch Population

**File:** `controllers/userController.js`

**Changes:**
```javascript
const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('-password -refreshToken -passwordResetToken -passwordResetExpires')
    .populate('branch', 'name code');

  if (!user) {
    return ApiResponse.error(res, 404, 'User not found');
  }

  return ApiResponse.success(res, 200, 'User retrieved successfully', user);
});
```

---

### Task B3: Update `createUser` - Add Branch Validation

**File:** `controllers/userController.js`

**Changes:**
```javascript
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, branch } = req.body;

  // Basic validation
  if (!name || !email || !password) {
    return ApiResponse.error(res, 400, 'Please provide name, email and password');
  }

  if (name.length < 2) {
    return ApiResponse.error(res, 400, 'Name must be at least 2 characters');
  }

  if (password.length < 6) {
    return ApiResponse.error(res, 400, 'Password must be at least 6 characters');
  }

  // Validate role (don't allow creating customers via admin)
  const validRoles = ['admin', 'salesperson', 'mechanic'];
  if (role && !validRoles.includes(role)) {
    return ApiResponse.error(res, 400, 'Invalid role. Must be admin, salesperson, or mechanic');
  }

  // Check if user exists
  const userExists = await User.findOne({ email: email.toLowerCase() });
  if (userExists) {
    return ApiResponse.error(res, 400, 'User with this email already exists');
  }

  // Validate branch for salesperson/mechanic
  const userRole = role || 'salesperson';
  if ((userRole === 'salesperson' || userRole === 'mechanic') && !branch) {
    return ApiResponse.error(res, 400, 'Branch is required for salesperson and mechanic roles');
  }

  // Validate branch exists if provided
  if (branch) {
    const Branch = require('../models/Branch');
    const branchExists = await Branch.findById(branch);
    if (!branchExists) {
      return ApiResponse.error(res, 404, 'Branch not found');
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
```

---

### Task B4: Update `updateUser` - Add Self-Protection & Branch Validation

**File:** `controllers/userController.js`

**Changes:**
```javascript
const updateUser = asyncHandler(async (req, res) => {
  const { name, email, role, branch, isActive } = req.body;
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

  // Self-protection: Cannot deactivate own account
  if (userId === currentUserId && isActive === false) {
    return ApiResponse.error(res, 400, 'Cannot deactivate your own account');
  }

  // Validate name length
  if (name !== undefined && name.length < 2) {
    return ApiResponse.error(res, 400, 'Name must be at least 2 characters');
  }

  // Validate email uniqueness (if changing)
  if (email && email.toLowerCase() !== user.email) {
    const emailExists = await User.findOne({ 
      email: email.toLowerCase(), 
      _id: { $ne: userId } 
    });
    if (emailExists) {
      return ApiResponse.error(res, 400, 'Email already in use');
    }
  }

  // Determine final role
  const finalRole = role || user.role;

  // Validate branch for salesperson/mechanic
  const finalBranch = branch !== undefined ? branch : user.branch;
  if ((finalRole === 'salesperson' || finalRole === 'mechanic') && !finalBranch) {
    return ApiResponse.error(res, 400, 'Branch is required for salesperson and mechanic roles');
  }

  // Validate branch exists if provided
  if (branch) {
    const Branch = require('../models/Branch');
    const branchExists = await Branch.findById(branch);
    if (!branchExists) {
      return ApiResponse.error(res, 404, 'Branch not found');
    }
  }

  // Update fields
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email.toLowerCase();
  if (role !== undefined) user.role = role;
  if (branch !== undefined) user.branch = branch || undefined;

  // Handle activation/deactivation
  if (typeof isActive === 'boolean') {
    user.isActive = isActive;
    // Clear refresh token on deactivation to force logout
    if (!isActive) {
      user.refreshToken = undefined;
    }
  }

  await user.save();

  // Populate branch for response
  const populatedUser = await User.findById(user._id)
    .select('-password -refreshToken -passwordResetToken -passwordResetExpires')
    .populate('branch', 'name code');

  return ApiResponse.success(res, 200, 'User updated successfully', populatedUser);
});
```

---

### Task B5: Add `toggleUserActive` Controller

**File:** `controllers/userController.js`

**Add new method:**
```javascript
// @desc    Toggle user active status
// @route   PATCH /api/users/:id/toggle-active
// @access  Private/Admin
const toggleUserActive = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const currentUserId = req.user._id.toString();

  const user = await User.findById(userId);
  if (!user) {
    return ApiResponse.error(res, 404, 'User not found');
  }

  // Self-protection: Cannot toggle own status
  if (userId === currentUserId) {
    return ApiResponse.error(res, 400, 'Cannot toggle your own account status');
  }

  // Toggle status
  user.isActive = !user.isActive;

  // Clear refresh token on deactivation to force logout
  if (!user.isActive) {
    user.refreshToken = undefined;
  }

  await user.save();

  // Populate branch for response
  const populatedUser = await User.findById(user._id)
    .select('-password -refreshToken -passwordResetToken -passwordResetExpires')
    .populate('branch', 'name code');

  const action = user.isActive ? 'activated' : 'deactivated';
  return ApiResponse.success(res, 200, `User ${action} successfully`, populatedUser);
});
```

---

### Task B6: Add `changeUserPassword` Controller

**File:** `controllers/userController.js`

**Add new method:**
```javascript
// @desc    Change user password (admin)
// @route   PATCH /api/users/:id/password
// @access  Private/Admin
const changeUserPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return ApiResponse.error(res, 400, 'Password must be at least 6 characters');
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    return ApiResponse.error(res, 404, 'User not found');
  }

  // Update password (will be hashed by pre-save hook)
  user.password = newPassword;
  // Clear refresh token to force re-login
  user.refreshToken = undefined;

  await user.save();

  return ApiResponse.success(res, 200, 'Password changed successfully');
});
```

---

### Task B7: Update Routes

**File:** `routes/userRoutes.js`

**Changes:**
```javascript
const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  toggleUserActive,      // NEW
  changeUserPassword,    // NEW
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

// All routes require admin
router.use(protect);
router.use(authorize('admin'));

router.route('/')
  .get(getUsers)
  .post(createUser);

router.route('/:id')
  .get(getUser)
  .put(updateUser)
  .delete(deleteUser);

// NEW routes
router.route('/:id/toggle-active')
  .patch(toggleUserActive);

router.route('/:id/password')
  .patch(changeUserPassword);

module.exports = router;
```

---

### Task B8: Update Controller Exports

**File:** `controllers/userController.js`

**Update exports:**
```javascript
module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  toggleUserActive,      // NEW
  changeUserPassword,    // NEW
};
```

---

## Implementation Checklist

### Controller Updates

- [ ] **B1.** Update `getUsers` - Add pagination, search, and filters
- [ ] **B2.** Update `getUser` - Add branch population
- [ ] **B3.** Update `createUser` - Add branch validation, role validation
- [ ] **B4.** Update `updateUser` - Add self-protection, branch validation
- [ ] **B5.** Add `toggleUserActive` - New toggle endpoint
- [ ] **B6.** Add `changeUserPassword` - New password change endpoint
- [ ] **B7.** Update routes - Add new PATCH routes
- [ ] **B8.** Update exports - Export new methods

### API Response Utility (if needed)

- [ ] **B9.** Add `successPaginated` method to `ApiResponse` if not exists

---

## Test Cases

Create test file: `tests/user.test.js`

### Test Setup

```javascript
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/server');
const User = require('../src/models/User');
const Branch = require('../src/models/Branch');

describe('User Management API', () => {
  let adminToken;
  let adminUser;
  let testBranch;
  let salespersonToken;
  let salespersonUser;

  beforeAll(async () => {
    // Create test branch
    testBranch = await Branch.create({
      name: 'Test Branch',
      code: 'TB001',
      address: { street: '123 Test St', city: 'Test City', state: 'TS', zipCode: '12345' },
      phone: '555-0100',
      isActive: true,
    });

    // Create admin user
    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: 'admin123',
      role: 'admin',
      isActive: true,
    });

    // Create salesperson user
    salespersonUser = await User.create({
      name: 'Sales Person',
      email: 'sales@test.com',
      password: 'sales123',
      role: 'salesperson',
      branch: testBranch._id,
      isActive: true,
    });

    // Get admin token
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'admin123' });
    adminToken = adminLogin.body.data.accessToken;

    // Get salesperson token
    const salesLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'sales@test.com', password: 'sales123' });
    salespersonToken = salesLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await User.deleteMany({ email: { $in: ['admin@test.com', 'sales@test.com', 'newuser@test.com', 'mechanic@test.com'] } });
    await Branch.findByIdAndDelete(testBranch._id);
    await mongoose.connection.close();
  });

  // ... test cases below ...
});
```

---

### Test Case 1: GET /api/users - List Users (Admin)

```javascript
describe('GET /api/users', () => {
  it('should return paginated users for admin', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
  });

  it('should filter users by role', async () => {
    const res = await request(app)
      .get('/api/users?role=salesperson')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    res.body.data.forEach(user => {
      expect(user.role).toBe('salesperson');
    });
  });

  it('should search users by name', async () => {
    const res = await request(app)
      .get('/api/users?search=Admin')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('should filter users by active status', async () => {
    const res = await request(app)
      .get('/api/users?isActive=true')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    res.body.data.forEach(user => {
      expect(user.isActive).toBe(true);
    });
  });

  it('should reject non-admin access', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${salespersonToken}`);

    expect(res.status).toBe(403);
  });

  it('should reject unauthenticated access', async () => {
    const res = await request(app)
      .get('/api/users');

    expect(res.status).toBe(401);
  });
});
```

---

### Test Case 2: GET /api/users/:id - Get Single User

```javascript
describe('GET /api/users/:id', () => {
  it('should return user with populated branch', async () => {
    const res = await request(app)
      .get(`/api/users/${salespersonUser._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(salespersonUser._id.toString());
    expect(res.body.data.branch).toBeDefined();
    expect(res.body.data.branch.name).toBe('Test Branch');
    expect(res.body.data.password).toBeUndefined();
  });

  it('should return 404 for non-existent user', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/users/${fakeId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});
```

---

### Test Case 3: POST /api/users - Create User

```javascript
describe('POST /api/users', () => {
  it('should create user with valid data', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'New User',
        email: 'newuser@test.com',
        password: 'password123',
        role: 'salesperson',
        branch: testBranch._id,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('New User');
    expect(res.body.data.role).toBe('salesperson');
    expect(res.body.data.branch._id).toBe(testBranch._id.toString());
  });

  it('should reject creation without required fields', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test',
        // missing email and password
      });

    expect(res.status).toBe(400);
  });

  it('should reject duplicate email', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Duplicate',
        email: 'admin@test.com', // already exists
        password: 'password123',
        role: 'admin',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('already exists');
  });

  it('should require branch for salesperson', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'No Branch Sales',
        email: 'nobranch@test.com',
        password: 'password123',
        role: 'salesperson',
        // missing branch
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Branch is required');
  });

  it('should require branch for mechanic', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'No Branch Mechanic',
        email: 'mechanic@test.com',
        password: 'password123',
        role: 'mechanic',
        // missing branch
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Branch is required');
  });

  it('should create admin without branch', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'New Admin',
        email: 'newadmin@test.com',
        password: 'password123',
        role: 'admin',
        // no branch needed for admin
      });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('admin');

    // Cleanup
    await User.findByIdAndDelete(res.body.data._id);
  });

  it('should reject invalid branch ID', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bad Branch',
        email: 'badbranch@test.com',
        password: 'password123',
        role: 'salesperson',
        branch: fakeId,
      });

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('Branch not found');
  });
});
```

---

### Test Case 4: PUT /api/users/:id - Update User

```javascript
describe('PUT /api/users/:id', () => {
  let updateTestUser;

  beforeAll(async () => {
    updateTestUser = await User.create({
      name: 'Update Test',
      email: 'updatetest@test.com',
      password: 'password123',
      role: 'salesperson',
      branch: testBranch._id,
      isActive: true,
    });
  });

  afterAll(async () => {
    await User.findByIdAndDelete(updateTestUser._id);
  });

  it('should update user name', async () => {
    const res = await request(app)
      .put(`/api/users/${updateTestUser._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Name');
  });

  it('should prevent admin from changing own role', async () => {
    const res = await request(app)
      .put(`/api/users/${adminUser._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'salesperson' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Cannot change your own role');
  });

  it('should prevent admin from deactivating self', async () => {
    const res = await request(app)
      .put(`/api/users/${adminUser._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Cannot deactivate your own account');
  });

  it('should reject duplicate email', async () => {
    const res = await request(app)
      .put(`/api/users/${updateTestUser._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'admin@test.com' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Email already in use');
  });

  it('should clear refresh token on deactivation', async () => {
    const res = await request(app)
      .put(`/api/users/${updateTestUser._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    const updatedUser = await User.findById(updateTestUser._id);
    expect(updatedUser.refreshToken).toBeUndefined();

    // Reactivate for other tests
    await User.findByIdAndUpdate(updateTestUser._id, { isActive: true });
  });
});
```

---

### Test Case 5: PATCH /api/users/:id/toggle-active - Toggle Active Status

```javascript
describe('PATCH /api/users/:id/toggle-active', () => {
  let toggleTestUser;

  beforeAll(async () => {
    toggleTestUser = await User.create({
      name: 'Toggle Test',
      email: 'toggletest@test.com',
      password: 'password123',
      role: 'mechanic',
      branch: testBranch._id,
      isActive: true,
    });
  });

  afterAll(async () => {
    await User.findByIdAndDelete(toggleTestUser._id);
  });

  it('should deactivate an active user', async () => {
    const res = await request(app)
      .patch(`/api/users/${toggleTestUser._id}/toggle-active`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
    expect(res.body.message).toContain('deactivated');
  });

  it('should activate an inactive user', async () => {
    const res = await request(app)
      .patch(`/api/users/${toggleTestUser._id}/toggle-active`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
    expect(res.body.message).toContain('activated');
  });

  it('should prevent admin from toggling own status', async () => {
    const res = await request(app)
      .patch(`/api/users/${adminUser._id}/toggle-active`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Cannot toggle your own account');
  });

  it('should return 404 for non-existent user', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .patch(`/api/users/${fakeId}/toggle-active`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});
```

---

### Test Case 6: PATCH /api/users/:id/password - Change Password

```javascript
describe('PATCH /api/users/:id/password', () => {
  let passwordTestUser;

  beforeAll(async () => {
    passwordTestUser = await User.create({
      name: 'Password Test',
      email: 'passwordtest@test.com',
      password: 'oldpassword123',
      role: 'salesperson',
      branch: testBranch._id,
      isActive: true,
      refreshToken: 'some-refresh-token',
    });
  });

  afterAll(async () => {
    await User.findByIdAndDelete(passwordTestUser._id);
  });

  it('should change user password', async () => {
    const res = await request(app)
      .patch(`/api/users/${passwordTestUser._id}/password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'newpassword123' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Password changed');

    // Verify refresh token is cleared
    const updatedUser = await User.findById(passwordTestUser._id);
    expect(updatedUser.refreshToken).toBeUndefined();
  });

  it('should allow login with new password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'passwordtest@test.com',
        password: 'newpassword123',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('should reject short password', async () => {
    const res = await request(app)
      .patch(`/api/users/${passwordTestUser._id}/password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: '123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('at least 6 characters');
  });

  it('should reject missing password', async () => {
    const res = await request(app)
      .patch(`/api/users/${passwordTestUser._id}/password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('should return 404 for non-existent user', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .patch(`/api/users/${fakeId}/password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'newpassword123' });

    expect(res.status).toBe(404);
  });
});
```

---

### Test Case 7: Deactivated User Access Denial

```javascript
describe('Deactivated User Access', () => {
  let deactivatedUser;
  let deactivatedToken;

  beforeAll(async () => {
    deactivatedUser = await User.create({
      name: 'Deactivated User',
      email: 'deactivated@test.com',
      password: 'password123',
      role: 'salesperson',
      branch: testBranch._id,
      isActive: true,
    });

    // Get token while active
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'deactivated@test.com', password: 'password123' });
    deactivatedToken = loginRes.body.data.accessToken;

    // Deactivate the user
    await User.findByIdAndUpdate(deactivatedUser._id, { isActive: false });
  });

  afterAll(async () => {
    await User.findByIdAndDelete(deactivatedUser._id);
  });

  it('should deny access with token after deactivation', async () => {
    const res = await request(app)
      .get('/api/inventory')
      .set('Authorization', `Bearer ${deactivatedToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('deactivated');
  });

  it('should deny login for deactivated user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'deactivated@test.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('deactivated');
  });
});
```

---

### Test Case 8: DELETE /api/users/:id - Delete User

```javascript
describe('DELETE /api/users/:id', () => {
  let deleteTestUser;

  beforeEach(async () => {
    deleteTestUser = await User.create({
      name: 'Delete Test',
      email: 'deletetest@test.com',
      password: 'password123',
      role: 'mechanic',
      branch: testBranch._id,
      isActive: true,
    });
  });

  afterEach(async () => {
    await User.findByIdAndDelete(deleteTestUser._id);
  });

  it('should delete a user', async () => {
    const res = await request(app)
      .delete(`/api/users/${deleteTestUser._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const deletedUser = await User.findById(deleteTestUser._id);
    expect(deletedUser).toBeNull();
  });

  it('should return 404 for non-existent user', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/users/${fakeId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});
```

---

## Summary

This backend implementation plan provides:

1. **6 API endpoints** for complete user management
2. **Self-protection** to prevent admins from locking themselves out
3. **Branch validation** for role-based requirements
4. **Automatic logout** via refresh token clearing on deactivation
5. **Comprehensive test coverage** with 30+ test cases

**Estimated Time:** 1-2 days for implementation + testing

---

**End of Backend User Management Plan**
