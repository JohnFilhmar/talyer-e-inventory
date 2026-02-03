# User Management Implementation Plan

**Feature:** User Management (Admin Exclusive)  
**Priority:** High (Security & Operations)  
**Estimated Effort:** 3-4 days  
**Dependencies:** Phase 1 (Authentication) Complete

---

## Table of Contents

1. [Overview](#overview)
2. [Scope & Requirements](#scope--requirements)
3. [Existing Resources Analysis](#existing-resources-analysis)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [Security Enhancements](#security-enhancements)
7. [Implementation Checklist](#implementation-checklist)
8. [Testing Plan](#testing-plan)

---

## Overview

This feature enables administrators to manage system users including creating new users, editing user profiles, and deactivating/reactivating user accounts. The feature is **exclusive to admin users** and includes enhanced security checks to automatically logout deactivated users.

### Core Capabilities

| Capability | Description |
|------------|-------------|
| **View Users** | List all system users with filtering and search |
| **Create User** | Add new staff (salesperson, mechanic) with branch assignment |
| **Edit User** | Update user details, role, branch assignment |
| **Toggle Active Status** | Activate/deactivate user accounts |
| **Auto-Logout Deactivated** | Force logout users when their account is deactivated |

---

## Scope & Requirements

### Functional Requirements

1. **User List Page** (`/users`)
   - Display all users in a table with columns: Name, Email, Role, Branch, Status, Actions
   - Search by name or email
   - Filter by role (all, admin, salesperson, mechanic)
   - Filter by status (all, active, inactive)
   - Filter by branch (for non-admin users)
   - Pagination support
   - Only visible to admin users in navigation

2. **Create User Modal**
   - Fields: Name, Email, Password, Role, Branch (conditional)
   - Branch required for salesperson and mechanic roles
   - Password strength validation
   - Email uniqueness validation
   - Admin can create any role except 'customer' (customers self-register)

3. **Edit User Modal**
   - Pre-populate with existing user data
   - Cannot change own role (prevent admin lockout)
   - Cannot deactivate own account
   - Password change optional (separate field)
   - Branch reassignment with validation

4. **User Activation/Deactivation**
   - Toggle button in user row
   - Confirmation modal before deactivation
   - Show warning about force logout
   - Cannot deactivate self
   - Deactivation invalidates refresh token

5. **Security: Force Logout on Deactivation**
   - Backend clears refresh token on deactivation
   - Auth middleware already checks `isActive` ✅
   - Token refresh endpoint already checks `isActive` ✅
   - Frontend: if 401 with "Account is deactivated" → logout

### Non-Functional Requirements

1. **Access Control**: Only `admin` role can access user management
2. **Audit Trail**: User changes logged (future enhancement)
3. **Performance**: Paginated queries, no full table loads
4. **UX**: Confirmation dialogs for destructive actions

---

## Existing Resources Analysis

### ✅ Already Implemented (Backend)

| Resource | Location | Status |
|----------|----------|--------|
| User Model | `backend/src/models/User.js` | ✅ Complete with `isActive`, `role`, `branch` |
| User Controller | `backend/src/controllers/userController.js` | ✅ CRUD operations exist |
| User Routes | `backend/src/routes/userRoutes.js` | ✅ Admin-only routes configured |
| Auth Middleware | `backend/src/middleware/auth.js` | ✅ `isActive` check exists |
| Login Controller | `backend/src/controllers/authController.js` | ✅ `isActive` check on login |
| Refresh Token | `backend/src/controllers/authController.js` | ✅ `isActive` check on refresh |

### ✅ Already Implemented (Frontend)

| Resource | Location | Status |
|----------|----------|--------|
| User Type | `frontend/src/types/auth.ts` | ✅ `User`, `UserRole` types exist |
| User Service (partial) | `frontend/src/lib/services/userService.ts` | ⚠️ Only `getAll`, `getManagers`, `getById` |
| useAuth Hook | `frontend/src/hooks/useAuth.ts` | ✅ `isAdmin()`, `hasRole()` helpers |
| Role Guard | `frontend/src/middlewares/roleGuard.tsx` | ✅ HOC for role-based access |
| Navbar | `frontend/src/components/layouts/Navbar.tsx` | ⚠️ Need to add Users nav item |

### 🔧 Needs Implementation/Updates

| Resource | Location | Action Required |
|----------|----------|-----------------|
| User Service | `userService.ts` | Add `create`, `update`, `toggleActive` |
| User Hooks | Create `useUsers.ts` | New file with React Query hooks |
| User Types | Create `types/user.ts` | Extended user types and payloads |
| Users Page | `app/(protected)/users/page.tsx` | New page |
| UserFormModal | `components/users/UserFormModal.tsx` | New component |
| UserTable | `components/users/UserTable.tsx` | New component |
| ToggleActiveModal | `components/users/ToggleActiveModal.tsx` | New component |
| Navbar | Update navigation items | Add Users link (admin only) |
| AuthStore | `stores/authStore.ts` | Handle deactivation logout |

---

## Backend Implementation

### Phase 1: Enhance User Controller

The existing `userController.js` needs minor enhancements:

#### 1.1 Update `createUser` to include branch validation

```javascript
// In createUser - ADD branch handling
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, branch } = req.body;

  // Validation
  if (!name || !email || !password) {
    return ApiResponse.error(res, 400, 'Please provide name, email and password');
  }

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    return ApiResponse.error(res, 400, 'User already exists');
  }

  // Validate branch for salesperson/mechanic
  if ((role === 'salesperson' || role === 'mechanic') && !branch) {
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
    email,
    password,
    role: role || 'salesperson',
    branch: branch || undefined,
  });

  // Populate branch for response
  const populatedUser = await User.findById(user._id)
    .select('-password -refreshToken')
    .populate('branch', 'name code');

  return ApiResponse.success(res, 201, 'User created successfully', populatedUser);
});
```

#### 1.2 Update `updateUser` to include branch and prevent self-role-change

```javascript
const updateUser = asyncHandler(async (req, res) => {
  const { name, email, role, branch, isActive } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) {
    return ApiResponse.error(res, 404, 'User not found');
  }

  // Prevent changing own role
  if (req.params.id === req.user._id.toString() && role && role !== user.role) {
    return ApiResponse.error(res, 400, 'Cannot change your own role');
  }

  // Prevent deactivating self
  if (req.params.id === req.user._id.toString() && isActive === false) {
    return ApiResponse.error(res, 400, 'Cannot deactivate your own account');
  }

  // Validate branch for salesperson/mechanic
  const newRole = role || user.role;
  if ((newRole === 'salesperson' || newRole === 'mechanic') && !branch && !user.branch) {
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
  if (name) user.name = name;
  if (email) {
    const emailExists = await User.findOne({ email, _id: { $ne: req.params.id } });
    if (emailExists) {
      return ApiResponse.error(res, 400, 'Email already in use');
    }
    user.email = email;
  }
  if (role) user.role = role;
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

  const populatedUser = await User.findById(user._id)
    .select('-password -refreshToken')
    .populate('branch', 'name code');

  return ApiResponse.success(res, 200, 'User updated successfully', populatedUser);
});
```

#### 1.3 Add dedicated toggle active endpoint

```javascript
// NEW: Toggle user active status
const toggleUserActive = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return ApiResponse.error(res, 404, 'User not found');
  }

  // Prevent toggling own status
  if (req.params.id === req.user._id.toString()) {
    return ApiResponse.error(res, 400, 'Cannot toggle your own account status');
  }

  // Toggle status
  user.isActive = !user.isActive;
  
  // Clear refresh token on deactivation
  if (!user.isActive) {
    user.refreshToken = undefined;
  }

  await user.save();

  const populatedUser = await User.findById(user._id)
    .select('-password -refreshToken')
    .populate('branch', 'name code');

  return ApiResponse.success(
    res,
    200,
    `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
    populatedUser
  );
});
```

#### 1.4 Add password change endpoint (optional update)

```javascript
// NEW: Change user password (admin only)
const changeUserPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return ApiResponse.error(res, 400, 'Password must be at least 6 characters');
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    return ApiResponse.error(res, 404, 'User not found');
  }

  user.password = newPassword; // Will be hashed by pre-save hook
  user.refreshToken = undefined; // Force re-login with new password
  await user.save();

  return ApiResponse.success(res, 200, 'Password changed successfully');
});
```

#### 1.5 Update routes

```javascript
// In userRoutes.js - ADD new routes
router.route('/:id/toggle-active').patch(toggleUserActive);
router.route('/:id/password').patch(changeUserPassword);
```

---

## Frontend Implementation

### Phase 2: Types & Service Layer

#### 2.1 Create `types/user.ts`

```typescript
// frontend/src/types/user.ts

import type { UserRole, User } from './auth';
import type { Branch } from './branch';

/**
 * Extended User interface with populated branch
 */
export interface UserWithBranch extends Omit<User, 'branch'> {
  branch?: PopulatedBranch | string;
}

export interface PopulatedBranch {
  _id: string;
  name: string;
  code: string;
}

/**
 * User list query parameters
 */
export interface UserListParams {
  search?: string;
  role?: UserRole | '';
  branch?: string;
  isActive?: 'true' | 'false';
  page?: number;
  limit?: number;
}

/**
 * Create user payload
 */
export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  branch?: string;
}

/**
 * Update user payload
 */
export interface UpdateUserPayload {
  name?: string;
  email?: string;
  role?: UserRole;
  branch?: string | null;
  isActive?: boolean;
}

/**
 * Change password payload
 */
export interface ChangePasswordPayload {
  newPassword: string;
}

/**
 * User stats for dashboard/summary
 */
export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  byRole: {
    admin: number;
    salesperson: number;
    mechanic: number;
    customer: number;
  };
}

// Type guards
export function isPopulatedUserBranch(branch: PopulatedBranch | string | undefined): branch is PopulatedBranch {
  return typeof branch === 'object' && branch !== null && '_id' in branch;
}

// Role options for dropdowns (exclude customer - they self-register)
export const STAFF_ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrator' },
  { value: 'salesperson', label: 'Salesperson' },
  { value: 'mechanic', label: 'Mechanic' },
] as const;

// All role options (for filters)
export const ALL_ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrator' },
  { value: 'salesperson', label: 'Salesperson' },
  { value: 'mechanic', label: 'Mechanic' },
  { value: 'customer', label: 'Customer' },
] as const;
```

#### 2.2 Extend `userService.ts`

```typescript
// frontend/src/lib/services/userService.ts - ADDITIONS

import type { PaginatedResponse } from '@/types/api';
import type {
  UserWithBranch,
  UserListParams,
  CreateUserPayload,
  UpdateUserPayload,
  ChangePasswordPayload,
} from '@/types/user';

export const userService = {
  // ... existing methods ...

  /**
   * Get all users with pagination and filters (admin only)
   */
  async getAllPaginated(params: UserListParams = {}): Promise<PaginatedResponse<UserWithBranch>> {
    const { data } = await apiClient.get<ApiResponse<UserWithBranch[]>>('/api/users', {
      params,
    });

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },

  /**
   * Create a new user (admin only)
   */
  async create(payload: CreateUserPayload): Promise<UserWithBranch> {
    const { data } = await apiClient.post<ApiResponse<UserWithBranch>>('/api/users', payload);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to create user');
    }

    return data.data;
  },

  /**
   * Update an existing user (admin only)
   */
  async update(id: string, payload: UpdateUserPayload): Promise<UserWithBranch> {
    const { data } = await apiClient.put<ApiResponse<UserWithBranch>>(`/api/users/${id}`, payload);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to update user');
    }

    return data.data;
  },

  /**
   * Toggle user active status (admin only)
   */
  async toggleActive(id: string): Promise<UserWithBranch> {
    const { data } = await apiClient.patch<ApiResponse<UserWithBranch>>(`/api/users/${id}/toggle-active`);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to toggle user status');
    }

    return data.data;
  },

  /**
   * Change user password (admin only)
   */
  async changePassword(id: string, payload: ChangePasswordPayload): Promise<void> {
    const { data } = await apiClient.patch<ApiResponse<void>>(`/api/users/${id}/password`, payload);

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to change password');
    }
  },

  /**
   * Delete user (admin only) - soft delete by deactivation preferred
   */
  async delete(id: string): Promise<void> {
    const { data } = await apiClient.delete<ApiResponse<void>>(`/api/users/${id}`);

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to delete user');
    }
  },
};
```

#### 2.3 Create `hooks/useUsers.ts`

```typescript
// frontend/src/hooks/useUsers.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/lib/services/userService';
import type {
  UserWithBranch,
  UserListParams,
  CreateUserPayload,
  UpdateUserPayload,
  ChangePasswordPayload,
} from '@/types/user';
import type { PaginatedResponse } from '@/types/api';

/**
 * Query keys for user-related queries
 */
export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (params: UserListParams) => [...userKeys.lists(), params] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  managers: () => [...userKeys.all, 'managers'] as const,
};

/**
 * Hook to fetch paginated user list with filters
 */
export function useUsers(params: UserListParams = {}) {
  return useQuery<PaginatedResponse<UserWithBranch>, Error>({
    queryKey: userKeys.list(params),
    queryFn: () => userService.getAllPaginated(params),
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch a single user by ID
 */
export function useUser(id: string | undefined) {
  return useQuery<UserWithBranch, Error>({
    queryKey: userKeys.detail(id ?? ''),
    queryFn: () => userService.getById(id!),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to create a new user
 */
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation<UserWithBranch, Error, CreateUserPayload>({
    mutationFn: (payload) => userService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

/**
 * Hook to update an existing user
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation<UserWithBranch, Error, { id: string; payload: UpdateUserPayload }>({
    mutationFn: ({ id, payload }) => userService.update(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(data._id) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

/**
 * Hook to toggle user active status
 */
export function useToggleUserActive() {
  const queryClient = useQueryClient();

  return useMutation<UserWithBranch, Error, string>({
    mutationFn: (id) => userService.toggleActive(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(data._id) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

/**
 * Hook to change user password
 */
export function useChangeUserPassword() {
  return useMutation<void, Error, { id: string; payload: ChangePasswordPayload }>({
    mutationFn: ({ id, payload }) => userService.changePassword(id, payload),
  });
}

/**
 * Hook to delete a user
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => userService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}
```

### Phase 3: Components

#### 3.1 Component Structure

```
frontend/src/components/users/
├── index.ts                    # Barrel export
├── UserFormModal.tsx           # Create/Edit user modal
├── UserTable.tsx               # User list table with actions
├── UserFilters.tsx             # Search and filter controls
├── UserStatsCards.tsx          # Summary stats cards (optional)
├── ToggleActiveModal.tsx       # Confirmation for activate/deactivate
└── ChangePasswordModal.tsx     # Password change modal
```

#### 3.2 UserFormModal Design

```typescript
interface UserFormModalProps {
  isOpen: boolean;
  user?: UserWithBranch | null; // null = create mode
  onClose: () => void;
  onSuccess?: () => void;
}

// Form fields:
// - name: string (required)
// - email: string (required, email format)
// - password: string (required for create, hidden for edit)
// - role: select (admin, salesperson, mechanic)
// - branch: select (required if role is salesperson/mechanic)
//   - Show branch dropdown only when role is salesperson or mechanic
//   - Fetch branches from useBranches hook

// Validation (Zod):
const userFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  role: z.enum(['admin', 'salesperson', 'mechanic']),
  branch: z.string().optional(),
}).refine((data) => {
  // Branch required for salesperson/mechanic
  if ((data.role === 'salesperson' || data.role === 'mechanic') && !data.branch) {
    return false;
  }
  return true;
}, {
  message: 'Branch is required for salesperson and mechanic',
  path: ['branch'],
});
```

#### 3.3 UserTable Design

```typescript
interface UserTableProps {
  users: UserWithBranch[];
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSortChange: (field: string) => void;
  onEdit: (user: UserWithBranch) => void;
  onToggleActive: (user: UserWithBranch) => void;
  onChangePassword: (user: UserWithBranch) => void;
  currentUserId: string; // To disable actions on self
}

// Columns:
// - Name (sortable)
// - Email (sortable)
// - Role (badge)
// - Branch (if applicable)
// - Status (Active/Inactive badge)
// - Created (date, sortable)
// - Actions (Edit, Toggle Active, Change Password dropdown)
```

#### 3.4 ToggleActiveModal Design

```typescript
interface ToggleActiveModalProps {
  isOpen: boolean;
  user: UserWithBranch | null;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

// Content:
// - If deactivating: Warning that user will be logged out
// - If activating: Info that user can now log in
// - Show user name and email for confirmation
```

### Phase 4: Users Page

#### 4.1 Page Structure

```typescript
// frontend/src/app/(protected)/users/page.tsx

'use client';

import React, { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUsers, useToggleUserActive } from '@/hooks/useUsers';
import { useBranches } from '@/hooks/useBranches';
import {
  UserTable,
  UserFormModal,
  UserFilters,
  ToggleActiveModal,
  ChangePasswordModal,
} from '@/components/users';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import type { UserWithBranch, UserListParams } from '@/types/user';

export default function UsersPage() {
  const { user: currentUser, isAdmin } = useAuth();

  // Redirect non-admins
  if (!isAdmin()) {
    return <Alert variant="error">Access denied. Admin only.</Alert>;
  }

  // Filter state
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithBranch | null>(null);
  const [togglingUser, setTogglingUser] = useState<UserWithBranch | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserWithBranch | null>(null);

  // Build query params
  const queryParams: UserListParams = {
    search: search || undefined,
    role: roleFilter || undefined,
    branch: branchFilter || undefined,
    isActive: statusFilter === 'all' ? undefined : statusFilter === 'active' ? 'true' : 'false',
    page,
    limit: 20,
  };

  // Fetch data
  const { data, isLoading, error, refetch } = useUsers(queryParams);
  const { data: branchesData } = useBranches();
  const toggleMutation = useToggleUserActive();

  // Handlers
  const handleAddUser = useCallback(() => {
    setEditingUser(null);
    setShowFormModal(true);
  }, []);

  const handleEditUser = useCallback((user: UserWithBranch) => {
    setEditingUser(user);
    setShowFormModal(true);
  }, []);

  const handleToggleActive = useCallback((user: UserWithBranch) => {
    setTogglingUser(user);
  }, []);

  const handleConfirmToggle = useCallback(async () => {
    if (!togglingUser) return;
    await toggleMutation.mutateAsync(togglingUser._id);
    setTogglingUser(null);
  }, [togglingUser, toggleMutation]);

  // ... render UI
}
```

### Phase 5: Navbar Update

#### 5.1 Add Users Nav Item

```typescript
// In Navbar.tsx navItems array - ADD:
{
  label: 'Users',
  href: '/users',
  icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  roles: ['admin'], // ADMIN ONLY
},
```

---

## Security Enhancements

### 1. Force Logout on Deactivation (Already Implemented ✅)

The backend already handles this:

- `auth.js` middleware checks `isActive` on every request
- `authController.js` checks `isActive` on login and token refresh
- Returns 401 with "Account is deactivated" message

### 2. Frontend: Handle Deactivation Response

Update `authStore.ts` or `apiClient.ts` to handle 401 with deactivation:

```typescript
// In apiClient.ts interceptor - ENHANCE:
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle deactivated account specifically
    if (error.response?.status === 401 && 
        error.response?.data?.message === 'Account is deactivated') {
      // Clear auth state and redirect to login
      useAuthStore.getState().logout();
      window.location.href = '/login?reason=deactivated';
      return Promise.reject(error);
    }

    // ... existing token refresh logic ...
  }
);
```

### 3. Additional Enhancements (Suggestions)

#### 3.1 Password Strength Indicator

Add real-time password strength validation in UserFormModal:
- Show strength bar (weak/medium/strong)
- Check for: length, uppercase, lowercase, numbers, special chars

#### 3.2 Last Login Tracking (Future)

Add `lastLoginAt` field to User model for admin visibility:
- Shows when user last accessed the system
- Helps identify inactive accounts

#### 3.3 Confirmation Email on Create (Future)

Send email to new user with:
- Welcome message
- Temporary password or password reset link
- System access instructions

---

## Implementation Checklist

### Backend Tasks

- [ ] **B1.** Update `createUser` in `userController.js`
  - Add branch validation
  - Populate branch in response
  
- [ ] **B2.** Update `updateUser` in `userController.js`
  - Add self-role-change prevention
  - Add self-deactivation prevention
  - Add branch validation
  - Clear refresh token on deactivation
  
- [ ] **B3.** Add `toggleUserActive` endpoint
  - Create controller method
  - Add route: `PATCH /api/users/:id/toggle-active`
  
- [ ] **B4.** Add `changeUserPassword` endpoint
  - Create controller method
  - Add route: `PATCH /api/users/:id/password`
  
- [ ] **B5.** Update `getUsers` to support pagination/filtering
  - Add query params: search, role, branch, isActive, page, limit
  - Return paginated response

### Frontend Tasks

- [ ] **F1.** Create `types/user.ts`
  - UserListParams, CreateUserPayload, UpdateUserPayload
  - Role options constants
  - Type guards
  
- [ ] **F2.** Extend `userService.ts`
  - getAllPaginated, create, update, toggleActive, changePassword
  
- [ ] **F3.** Create `hooks/useUsers.ts`
  - useUsers, useUser, useCreateUser, useUpdateUser, useToggleUserActive
  
- [ ] **F4.** Create `components/users/` directory
  - UserFormModal.tsx
  - UserTable.tsx
  - UserFilters.tsx
  - ToggleActiveModal.tsx
  - ChangePasswordModal.tsx
  - index.ts (barrel export)
  
- [ ] **F5.** Create `app/(protected)/users/page.tsx`
  - Full CRUD UI
  - Admin-only access check
  
- [ ] **F6.** Update Navbar.tsx
  - Add Users nav item with admin-only role
  
- [ ] **F7.** Update apiClient.ts
  - Handle "Account is deactivated" 401 response
  
- [ ] **F8.** Create Zod validation schema
  - userFormSchema in `utils/validators/user.ts`

### Testing Tasks

- [ ] **T1.** Test user creation (admin)
- [ ] **T2.** Test user update (admin)
- [ ] **T3.** Test cannot change own role
- [ ] **T4.** Test cannot deactivate self
- [ ] **T5.** Test deactivation logs out user
- [ ] **T6.** Test reactivation allows login
- [ ] **T7.** Test non-admin cannot access /users
- [ ] **T8.** Test branch requirement for salesperson/mechanic

---

## Testing Plan

### Manual Testing Scenarios

| Test Case | Expected Result |
|-----------|-----------------|
| Admin visits /users | Page loads with user list |
| Non-admin visits /users | Redirected or access denied |
| Create user without branch (salesperson) | Error: Branch required |
| Create user with all fields | Success, user in list |
| Edit user name/email | Success, data updated |
| Try to change own role | Error: Cannot change own role |
| Try to deactivate self | Error: Cannot deactivate self |
| Deactivate another user | Success, user logged out |
| Deactivated user tries to login | Error: Account is deactivated |
| Deactivated user's token refresh | Error: Account is deactivated |
| Reactivate user | Success, user can login again |
| Change user password | Success, user must re-login |

### Edge Cases

1. **Last Admin**: Consider preventing deactivation if it's the last active admin
2. **Branch Deletion**: Handle users assigned to deleted branches
3. **Concurrent Edits**: Handle race conditions with optimistic updates

---

## File Summary

### Files to Create

```
backend/
  (no new files, updates to existing)

frontend/
  src/
    types/
      user.ts                              # NEW
    hooks/
      useUsers.ts                          # NEW
    utils/validators/
      user.ts                              # NEW
    components/users/
      index.ts                             # NEW
      UserFormModal.tsx                    # NEW
      UserTable.tsx                        # NEW
      UserFilters.tsx                      # NEW
      ToggleActiveModal.tsx                # NEW
      ChangePasswordModal.tsx              # NEW
    app/(protected)/
      users/
        page.tsx                           # NEW
```

### Files to Update

```
backend/
  src/
    controllers/userController.js          # UPDATE
    routes/userRoutes.js                   # UPDATE

frontend/
  src/
    lib/services/userService.ts            # UPDATE
    lib/apiClient.ts                       # UPDATE (deactivation handling)
    components/layouts/Navbar.tsx          # UPDATE (add Users nav)
```

---

## Timeline Estimate

| Day | Tasks |
|-----|-------|
| Day 1 | Backend: Update controller, add new endpoints, test API |
| Day 2 | Frontend: Types, service, hooks, basic page structure |
| Day 3 | Frontend: Components (UserFormModal, UserTable, modals) |
| Day 4 | Frontend: Polish, Navbar update, testing, bug fixes |

---

**End of Planning Document**
