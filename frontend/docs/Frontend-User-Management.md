# Frontend User Management Implementation Plan

**Feature:** User Management UI (Admin Exclusive)  
**Priority:** High (Security & Operations)  
**Estimated Effort:** 2-3 days  
**Dependencies:** Backend User Management API Complete

---

## Table of Contents

1. [Overview](#overview)
2. [Existing Resources Analysis](#existing-resources-analysis)
3. [Implementation Tasks](#implementation-tasks)
4. [Component Specifications](#component-specifications)
5. [Implementation Checklist](#implementation-checklist)

---

## Overview

This document covers the **frontend implementation** for User Management. The UI is exclusive to admin users and provides:

- User list with search, filters, and pagination
- Create new staff users with branch assignment
- Edit user details, role, and branch
- Activate/deactivate user accounts
- Change user passwords (admin reset)
- Admin-only navigation visibility

### Page Route

```
/users - User Management Page (Admin Only)
```

---

## Existing Resources Analysis

### ✅ Already Implemented

| Resource | File | Notes |
|----------|------|-------|
| User Type | `types/auth.ts` | `User`, `UserRole` types exist |
| User Service (partial) | `lib/services/userService.ts` | Only `getAll`, `getManagers`, `getById` |
| useAuth Hook | `hooks/useAuth.ts` | `isAdmin()`, `hasRole()` helpers |
| Role Guard | `middlewares/roleGuard.tsx` | HOC for role-based access |
| Navbar | `components/layouts/Navbar.tsx` | Role-based nav items pattern |
| Branch Service | `lib/services/branchService.ts` | Pattern reference |
| useBranches Hook | `hooks/useBranches.ts` | Pattern reference |
| Branches Page | `app/(protected)/branches/page.tsx` | CRUD page pattern reference |

### Patterns to Follow

1. **React Query Hooks Pattern** (from `useBranches.ts`):
   - Query keys factory
   - Paginated queries with filters
   - Mutations with cache invalidation

2. **Service Layer Pattern** (from `branchService.ts`):
   - API client methods with typed responses
   - Error handling

3. **Admin CRUD Page Pattern** (from `branches/page.tsx`):
   - Filter state management
   - Modal state management
   - Table with actions

4. **Nav Item Visibility Pattern** (from `Navbar.tsx`):
   - `roles?: UserRole[]` property for conditional visibility

---

## Implementation Tasks

### Phase 1: Types & Service Layer

#### Task F1: Create `types/user.ts`

**File:** `src/types/user.ts`

```typescript
import type { UserRole, User } from './auth';

/**
 * Populated branch in user response
 */
export interface PopulatedBranch {
  _id: string;
  name: string;
  code: string;
}

/**
 * User with populated branch (from API)
 */
export interface UserWithBranch extends Omit<User, 'branch'> {
  branch?: PopulatedBranch | null;
}

/**
 * User list query parameters
 */
export interface UserListParams {
  search?: string;
  role?: UserRole | '';
  branch?: string;
  isActive?: 'true' | 'false' | '';
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Create user request payload
 */
export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: Exclude<UserRole, 'customer'>;
  branch?: string;
}

/**
 * Update user request payload
 * NOTE: isActive is NOT accepted here - use separate activate/deactivate endpoints
 */
export interface UpdateUserPayload {
  name?: string;
  email?: string;
  role?: UserRole;
  branch?: string | null;
}

/**
 * Change password request payload
 */
export interface ChangePasswordPayload {
  newPassword: string;
}

/**
 * User form values (for React Hook Form)
 */
export interface UserFormValues {
  name: string;
  email: string;
  password?: string;
  role: Exclude<UserRole, 'customer'>;
  branch?: string;
}

/**
 * Type guard for populated branch
 */
export function isPopulatedBranch(
  branch: PopulatedBranch | string | null | undefined
): branch is PopulatedBranch {
  return typeof branch === 'object' && branch !== null && '_id' in branch;
}

/**
 * Staff role options (for create/edit - excludes customer)
 */
export const STAFF_ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrator' },
  { value: 'salesperson', label: 'Salesperson' },
  { value: 'mechanic', label: 'Mechanic' },
] as const;

/**
 * All role options (for filters - includes customer)
 */
export const ALL_ROLE_OPTIONS = [
  { value: '', label: 'All Roles' },
  { value: 'admin', label: 'Administrator' },
  { value: 'salesperson', label: 'Salesperson' },
  { value: 'mechanic', label: 'Mechanic' },
  { value: 'customer', label: 'Customer' },
] as const;

/**
 * Status filter options
 */
export const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
] as const;

/**
 * Roles that require branch assignment
 */
export const BRANCH_REQUIRED_ROLES: UserRole[] = ['salesperson', 'mechanic'];

/**
 * Check if role requires branch
 */
export function roleRequiresBranch(role: UserRole): boolean {
  return BRANCH_REQUIRED_ROLES.includes(role);
}
```

---

#### Task F2: Extend `lib/services/userService.ts`

**File:** `src/lib/services/userService.ts`

Replace/extend the existing file:

```typescript
import apiClient from '@/lib/apiClient';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { User } from '@/types/auth';
import type {
  UserWithBranch,
  UserListParams,
  CreateUserPayload,
  UpdateUserPayload,
  ChangePasswordPayload,
} from '@/types/user';

export const userService = {
  /**
   * Get all users (simple list, no pagination)
   * @deprecated Use getAllPaginated for admin user management
   */
  async getAll(): Promise<User[]> {
    const { data } = await apiClient.get<ApiResponse<User[]>>('/api/users');
    return data.data ?? [];
  },

  /**
   * Get managers for dropdown selection
   */
  async getManagers(): Promise<User[]> {
    const { data } = await apiClient.get<ApiResponse<User[]>>('/api/users', {
      params: { role: 'admin,salesperson' },
    });
    return data.data ?? [];
  },

  /**
   * Get single user by ID
   */
  async getById(id: string): Promise<UserWithBranch> {
    const { data } = await apiClient.get<ApiResponse<UserWithBranch>>(`/api/users/${id}`);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to fetch user');
    }

    return data.data;
  },

  /**
   * Get paginated users with filters (admin only)
   */
  async getAllPaginated(params: UserListParams = {}): Promise<PaginatedResponse<UserWithBranch>> {
    // Clean up empty params
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== '' && value !== undefined)
    );

    const { data } = await apiClient.get<ApiResponse<UserWithBranch[]>>('/api/users', {
      params: cleanParams,
    });

    return {
      data: data.data ?? [],
      pagination: data.pagination ?? {
        page: 1,
        limit: 20,
        total: 0,
        pages: 0, // Backend uses 'pages' not 'totalPages'
      },
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
   * Deactivate user (admin only)
   * Deactivated users are immediately logged out and cannot access the system
   */
  async deactivate(id: string): Promise<UserWithBranch> {
    const { data } = await apiClient.patch<ApiResponse<UserWithBranch>>(
      `/api/users/${id}/deactivate`
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to deactivate user');
    }

    return data.data;
  },

  /**
   * Activate user (admin only)
   * Reactivates a previously deactivated user
   */
  async activate(id: string): Promise<UserWithBranch> {
    const { data } = await apiClient.patch<ApiResponse<UserWithBranch>>(
      `/api/users/${id}/activate`
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to activate user');
    }

    return data.data;
  },

  /**
   * Change user password (admin only)
   */
  async changePassword(id: string, payload: ChangePasswordPayload): Promise<void> {
    const { data } = await apiClient.patch<ApiResponse<void>>(
      `/api/users/${id}/password`,
      payload
    );

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to change password');
    }
  },

  // NOTE: DELETE endpoint is intentionally not implemented.
  // Use deactivate() for soft-deletion to preserve data integrity.
};

export default userService;
```

---

#### Task F3: Create `hooks/useUsers.ts`

**File:** `src/hooks/useUsers.ts`

```typescript
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
 * Query keys factory for user queries
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
 * Hook to fetch paginated users with filters
 */
export function useUsers(params: UserListParams = {}) {
  return useQuery<PaginatedResponse<UserWithBranch>, Error>({
    queryKey: userKeys.list(params),
    queryFn: () => userService.getAllPaginated(params),
    staleTime: 30 * 1000, // 30 seconds
    placeholderData: (previousData) => previousData,
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
 * Hook to fetch managers (for dropdowns)
 */
export function useManagers() {
  return useQuery({
    queryKey: userKeys.managers(),
    queryFn: () => userService.getManagers(),
    staleTime: 5 * 60 * 1000, // 5 minutes
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
      // Invalidate all user lists
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
      // Update the specific user cache
      queryClient.setQueryData(userKeys.detail(data._id), data);
      // Invalidate user lists
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

/**
 * Hook to deactivate a user
 */
export function useDeactivateUser() {
  const queryClient = useQueryClient();

  return useMutation<UserWithBranch, Error, string>({
    mutationFn: (id) => userService.deactivate(id),
    onSuccess: (data) => {
      // Update the specific user cache
      queryClient.setQueryData(userKeys.detail(data._id), data);
      // Invalidate user lists
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

/**
 * Hook to activate a user
 */
export function useActivateUser() {
  const queryClient = useQueryClient();

  return useMutation<UserWithBranch, Error, string>({
    mutationFn: (id) => userService.activate(id),
    onSuccess: (data) => {
      // Update the specific user cache
      queryClient.setQueryData(userKeys.detail(data._id), data);
      // Invalidate user lists
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
    // No cache invalidation needed - password change doesn't affect displayed data
  });
}

// NOTE: useDeleteUser hook is not implemented.
// Backend uses soft-deletion via deactivate/activate endpoints.
// Use useDeactivateUser() instead.
```

---

#### Task F4: Create Validation Schema `utils/validators/user.ts`

**File:** `src/utils/validators/user.ts`

```typescript
import { z } from 'zod';
import { BRANCH_REQUIRED_ROLES } from '@/types/user';

/**
 * User form validation schema
 */
export const userFormSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(50, 'Name must be less than 50 characters'), // Backend limit is 50
    email: z
      .string()
      .email('Please enter a valid email address')
      .toLowerCase(),
    password: z
      .string()
      .min(6, 'Password must be at least 6 characters')
      .optional()
      .or(z.literal('')),
    role: z.enum(['admin', 'salesperson', 'mechanic'], {
      required_error: 'Please select a role',
    }),
    branch: z.string().optional(),
  })
  .refine(
    (data) => {
      // Branch required for salesperson/mechanic
      if (BRANCH_REQUIRED_ROLES.includes(data.role as any) && !data.branch) {
        return false;
      }
      return true;
    },
    {
      message: 'Branch is required for this role',
      path: ['branch'],
    }
  );

/**
 * Create user schema (password required)
 */
export const createUserSchema = userFormSchema.refine(
  (data) => data.password && data.password.length >= 6,
  {
    message: 'Password is required and must be at least 6 characters',
    path: ['password'],
  }
);

/**
 * Update user schema (password optional)
 */
export const updateUserSchema = userFormSchema;

/**
 * Change password schema
 */
export const changePasswordSchema = z.object({
  newPassword: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password must be less than 100 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type UserFormSchema = z.infer<typeof userFormSchema>;
export type CreateUserSchema = z.infer<typeof createUserSchema>;
export type UpdateUserSchema = z.infer<typeof updateUserSchema>;
export type ChangePasswordSchema = z.infer<typeof changePasswordSchema>;
```

---

### Phase 2: Components

#### Task F5: Create Component Directory Structure

```
src/components/users/
├── index.ts                    # Barrel export
├── UserFormModal.tsx           # Create/Edit user modal
├── UserTable.tsx               # User list table with actions
├── UserFilters.tsx             # Search and filter controls
├── ToggleActiveModal.tsx       # Confirm activate/deactivate
├── ChangePasswordModal.tsx     # Password change modal
└── UserStatusBadge.tsx         # Active/Inactive badge
```

---

#### Task F6: Create `components/users/index.ts`

**File:** `src/components/users/index.ts`

```typescript
export { UserFormModal } from './UserFormModal';
export { UserTable } from './UserTable';
export { UserFilters } from './UserFilters';
export { ToggleActiveModal } from './ToggleActiveModal';
export { ChangePasswordModal } from './ChangePasswordModal';
export { UserStatusBadge } from './UserStatusBadge';
```

---

#### Task F7: Create `UserStatusBadge.tsx`

**File:** `src/components/users/UserStatusBadge.tsx`

```typescript
'use client';

import React from 'react';
import clsx from 'clsx';

interface UserStatusBadgeProps {
  isActive: boolean;
  size?: 'sm' | 'md';
}

export function UserStatusBadge({ isActive, size = 'md' }: UserStatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-sm',
        isActive
          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      )}
    >
      <span
        className={clsx(
          'mr-1.5 h-1.5 w-1.5 rounded-full',
          isActive ? 'bg-green-500' : 'bg-red-500'
        )}
      />
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}
```

---

#### Task F8: Create `UserFilters.tsx`

**File:** `src/components/users/UserFilters.tsx`

```typescript
'use client';

import React from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { ALL_ROLE_OPTIONS, STATUS_OPTIONS } from '@/types/user';
import type { Branch } from '@/types/branch';
import { MagnifyingGlassIcon, FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface UserFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  roleFilter: string;
  onRoleFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  branchFilter: string;
  onBranchFilterChange: (value: string) => void;
  branches: Branch[];
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export function UserFilters({
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  statusFilter,
  onStatusFilterChange,
  branchFilter,
  onBranchFilterChange,
  branches,
  onClearFilters,
  hasActiveFilters,
}: UserFiltersProps) {
  const branchOptions = [
    { value: '', label: 'All Branches' },
    ...branches.map((b) => ({ value: b._id, label: b.name })),
  ];

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <Input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <FunnelIcon className="h-4 w-4" />
          <span>Filters:</span>
        </div>

        <Select
          value={roleFilter}
          onChange={(e) => onRoleFilterChange(e.target.value)}
          className="w-40"
        >
          {ALL_ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="w-36"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          value={branchFilter}
          onChange={(e) => onBranchFilterChange(e.target.value)}
          className="w-44"
        >
          {branchOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="text-gray-500 hover:text-gray-700"
          >
            <XMarkIcon className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
```

---

#### Task F9: Create `UserTable.tsx`

**File:** `src/components/users/UserTable.tsx`

```typescript
'use client';

import React from 'react';
import { Table, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { UserStatusBadge } from './UserStatusBadge';
import { isPopulatedBranch, STAFF_ROLE_OPTIONS } from '@/types/user';
import type { UserWithBranch } from '@/types/user';
import {
  PencilIcon,
  KeyIcon,
  UserMinusIcon,
  UserPlusIcon,
  EllipsisVerticalIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

interface UserTableProps {
  users: UserWithBranch[];
  currentUserId: string;
  onEdit: (user: UserWithBranch) => void;
  onToggleActive: (user: UserWithBranch) => void;
  onChangePassword: (user: UserWithBranch) => void;
  isLoading?: boolean;
}

export function UserTable({
  users,
  currentUserId,
  onEdit,
  onToggleActive,
  onChangePassword,
  isLoading,
}: UserTableProps) {
  const getRoleLabel = (role: string) => {
    const found = STAFF_ROLE_OPTIONS.find((r) => r.value === role);
    return found?.label ?? role;
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      case 'salesperson':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'mechanic':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'customer':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500">
        No users found. Try adjusting your filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHead>
          <TableRow>
            <TableCell header>Name</TableCell>
            <TableCell header>Email</TableCell>
            <TableCell header>Role</TableCell>
            <TableCell header>Branch</TableCell>
            <TableCell header>Status</TableCell>
            <TableCell header>Created</TableCell>
            <TableCell header className="w-20">
              Actions
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((user) => {
            const isSelf = user._id === currentUserId;
            const branchName = isPopulatedBranch(user.branch)
              ? user.branch.name
              : user.branch ?? '—';

            return (
              <TableRow key={user._id}>
                <TableCell className="font-medium">
                  {user.name}
                  {isSelf && (
                    <span className="ml-2 text-xs text-gray-400">(You)</span>
                  )}
                </TableCell>
                <TableCell className="text-gray-600">{user.email}</TableCell>
                <TableCell>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getRoleBadgeColor(
                      user.role
                    )}`}
                  >
                    {getRoleLabel(user.role)}
                  </span>
                </TableCell>
                <TableCell className="text-gray-600">{branchName}</TableCell>
                <TableCell>
                  <UserStatusBadge isActive={user.isActive} size="sm" />
                </TableCell>
                <TableCell className="text-gray-500 text-sm">
                  {format(new Date(user.createdAt), 'MMM d, yyyy')}
                </TableCell>
                <TableCell>
                  <Dropdown
                    trigger={
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <EllipsisVerticalIcon className="h-5 w-5" />
                      </Button>
                    }
                  >
                    <DropdownItem onClick={() => onEdit(user)}>
                      <PencilIcon className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownItem>
                    <DropdownItem onClick={() => onChangePassword(user)}>
                      <KeyIcon className="mr-2 h-4 w-4" />
                      Change Password
                    </DropdownItem>
                    {!isSelf && (
                      <DropdownItem
                        onClick={() => onToggleActive(user)}
                        className={user.isActive ? 'text-red-600' : 'text-green-600'}
                      >
                        {user.isActive ? (
                          <>
                            <UserMinusIcon className="mr-2 h-4 w-4" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <UserPlusIcon className="mr-2 h-4 w-4" />
                            Activate
                          </>
                        )}
                      </DropdownItem>
                    )}
                  </Dropdown>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

---

#### Task F10: Create `UserFormModal.tsx`

**File:** `src/components/users/UserFormModal.tsx`

```typescript
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { FormField, FormError } from '@/components/ui/Form';
import { createUserSchema, updateUserSchema, type UserFormSchema } from '@/utils/validators/user';
import { STAFF_ROLE_OPTIONS, roleRequiresBranch, isPopulatedBranch } from '@/types/user';
import type { UserWithBranch } from '@/types/user';
import type { Branch } from '@/types/branch';

interface UserFormModalProps {
  isOpen: boolean;
  user?: UserWithBranch | null; // null = create mode
  branches: Branch[];
  onClose: () => void;
  onSubmit: (data: UserFormSchema) => Promise<void>;
  isSubmitting: boolean;
}

export function UserFormModal({
  isOpen,
  user,
  branches,
  onClose,
  onSubmit,
  isSubmitting,
}: UserFormModalProps) {
  const isEditMode = !!user;

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<UserFormSchema>({
    resolver: zodResolver(isEditMode ? updateUserSchema : createUserSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'salesperson',
      branch: '',
    },
  });

  const selectedRole = watch('role');
  const showBranchField = roleRequiresBranch(selectedRole);

  // Reset form when modal opens/closes or user changes
  useEffect(() => {
    if (isOpen && user) {
      reset({
        name: user.name,
        email: user.email,
        password: '',
        role: user.role as 'admin' | 'salesperson' | 'mechanic',
        branch: isPopulatedBranch(user.branch) ? user.branch._id : (user.branch ?? ''),
      });
    } else if (isOpen) {
      reset({
        name: '',
        email: '',
        password: '',
        role: 'salesperson',
        branch: '',
      });
    }
  }, [isOpen, user, reset]);

  // Clear branch when switching to admin role
  useEffect(() => {
    if (!showBranchField) {
      setValue('branch', '');
    }
  }, [showBranchField, setValue]);

  const handleFormSubmit = async (data: UserFormSchema) => {
    await onSubmit(data);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? 'Edit User' : 'Create New User'}
    >
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        {/* Name */}
        <FormField label="Name" required error={errors.name?.message}>
          <Input
            {...register('name')}
            placeholder="Enter full name"
            disabled={isSubmitting}
          />
        </FormField>

        {/* Email */}
        <FormField label="Email" required error={errors.email?.message}>
          <Input
            {...register('email')}
            type="email"
            placeholder="Enter email address"
            disabled={isSubmitting}
          />
        </FormField>

        {/* Password */}
        <FormField
          label={isEditMode ? 'New Password' : 'Password'}
          required={!isEditMode}
          error={errors.password?.message}
          hint={isEditMode ? 'Leave empty to keep current password' : undefined}
        >
          <Input
            {...register('password')}
            type="password"
            placeholder={isEditMode ? 'Enter new password (optional)' : 'Enter password'}
            disabled={isSubmitting}
          />
        </FormField>

        {/* Role */}
        <FormField label="Role" required error={errors.role?.message}>
          <Select {...register('role')} disabled={isSubmitting}>
            {STAFF_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormField>

        {/* Branch (conditional) */}
        {showBranchField && (
          <FormField
            label="Branch"
            required
            error={errors.branch?.message}
            hint="Required for salesperson and mechanic roles"
          >
            <Select {...register('branch')} disabled={isSubmitting}>
              <option value="">Select a branch</option>
              {branches.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name} ({branch.code})
                </option>
              ))}
            </Select>
          </FormField>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {isEditMode ? 'Save Changes' : 'Create User'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
```

---

#### Task F11: Create `ToggleActiveModal.tsx`

**File:** `src/components/users/ToggleActiveModal.tsx`

```typescript
'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import type { UserWithBranch } from '@/types/user';

interface ToggleActiveModalProps {
  isOpen: boolean;
  user: UserWithBranch | null;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function ToggleActiveModal({
  isOpen,
  user,
  onClose,
  onConfirm,
  isLoading,
}: ToggleActiveModalProps) {
  if (!user) return null;

  const isDeactivating = user.isActive;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isDeactivating ? 'Deactivate User' : 'Activate User'}
    >
      <div className="space-y-4">
        {/* Icon */}
        <div className="flex justify-center">
          {isDeactivating ? (
            <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/30">
              <ExclamationTriangleIcon className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
          ) : (
            <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/30">
              <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          )}
        </div>

        {/* Message */}
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-300">
            Are you sure you want to{' '}
            <span className={isDeactivating ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
              {isDeactivating ? 'deactivate' : 'activate'}
            </span>{' '}
            the following user?
          </p>
          <p className="mt-2 font-medium text-gray-900 dark:text-white">
            {user.name}
          </p>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>

        {/* Warning for deactivation */}
        {isDeactivating && (
          <div className="rounded-lg bg-yellow-50 p-3 dark:bg-yellow-900/20">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              <strong>Warning:</strong> This user will be immediately logged out and
              will not be able to access the system until reactivated.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={isDeactivating ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={isLoading}
          >
            {isDeactivating ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

---

#### Task F12: Create `ChangePasswordModal.tsx`

**File:** `src/components/users/ChangePasswordModal.tsx`

```typescript
'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/Form';
import { changePasswordSchema, type ChangePasswordSchema } from '@/utils/validators/user';
import type { UserWithBranch } from '@/types/user';

interface ChangePasswordModalProps {
  isOpen: boolean;
  user: UserWithBranch | null;
  onClose: () => void;
  onSubmit: (newPassword: string) => Promise<void>;
  isSubmitting: boolean;
}

export function ChangePasswordModal({
  isOpen,
  user,
  onClose,
  onSubmit,
  isSubmitting,
}: ChangePasswordModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordSchema>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      reset({ newPassword: '', confirmPassword: '' });
    }
  }, [isOpen, reset]);

  const handleFormSubmit = async (data: ChangePasswordSchema) => {
    await onSubmit(data.newPassword);
  };

  if (!user) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change Password">
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        {/* User Info */}
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Changing password for:
          </p>
          <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">{user.email}</p>
        </div>

        {/* New Password */}
        <FormField
          label="New Password"
          required
          error={errors.newPassword?.message}
        >
          <Input
            {...register('newPassword')}
            type="password"
            placeholder="Enter new password"
            disabled={isSubmitting}
          />
        </FormField>

        {/* Confirm Password */}
        <FormField
          label="Confirm Password"
          required
          error={errors.confirmPassword?.message}
        >
          <Input
            {...register('confirmPassword')}
            type="password"
            placeholder="Confirm new password"
            disabled={isSubmitting}
          />
        </FormField>

        {/* Note */}
        <p className="text-sm text-gray-500">
          The user will be logged out and required to log in with the new password.
        </p>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Change Password
          </Button>
        </div>
      </form>
    </Modal>
  );
}
```

---

### Phase 3: Users Page

#### Task F13: Create `app/(protected)/users/page.tsx`

**File:** `src/app/(protected)/users/page.tsx`

```typescript
'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeactivateUser,
  useActivateUser,
  useChangeUserPassword,
} from '@/hooks/useUsers';
import {
  UserTable,
  UserFormModal,
  UserFilters,
  ToggleActiveModal,
  ChangePasswordModal,
} from '@/components/users';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { Alert } from '@/components/ui/Alert';
import { toast } from '@/components/ui/Toast';
import { PlusIcon, UsersIcon } from '@heroicons/react/24/outline';
import type { UserWithBranch, UserListParams, UserFormSchema } from '@/types/user';

export default function UsersPage() {
  const { user: currentUser, isAdmin } = useAuth();

  // Filter state
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithBranch | null>(null);
  const [togglingUser, setTogglingUser] = useState<UserWithBranch | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserWithBranch | null>(null);

  // Build query params
  const queryParams: UserListParams = useMemo(
    () => ({
      search: search || undefined,
      role: roleFilter || undefined,
      isActive: statusFilter || undefined,
      branch: branchFilter || undefined,
      page,
      limit,
    }),
    [search, roleFilter, statusFilter, branchFilter, page]
  );

  // Fetch data
  const { data, isLoading, error, refetch } = useUsers(queryParams);
  const { data: branchesData } = useBranches();
  const branches = branchesData?.data ?? [];

  // Mutations
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deactivateMutation = useDeactivateUser();
  const activateMutation = useActivateUser();
  const passwordMutation = useChangeUserPassword();

  // Check if there are active filters
  const hasActiveFilters = !!(search || roleFilter || statusFilter || branchFilter);

  // Handlers
  const handleAddUser = useCallback(() => {
    setEditingUser(null);
    setShowFormModal(true);
  }, []);

  const handleEditUser = useCallback((user: UserWithBranch) => {
    setEditingUser(user);
    setShowFormModal(true);
  }, []);

  const handleCloseFormModal = useCallback(() => {
    setShowFormModal(false);
    setEditingUser(null);
  }, []);

  const handleFormSubmit = useCallback(
    async (data: UserFormSchema) => {
      try {
        if (editingUser) {
          // Update existing user
          const payload: any = {
            name: data.name,
            email: data.email,
            role: data.role,
            branch: data.branch || null,
          };
          // Only include password if provided
          if (data.password) {
            // Note: Password change is separate endpoint
            // For now, we'll handle it separately
          }
          await updateMutation.mutateAsync({
            id: editingUser._id,
            payload,
          });
          toast.success('User updated successfully');
        } else {
          // Create new user
          await createMutation.mutateAsync({
            name: data.name,
            email: data.email,
            password: data.password!,
            role: data.role,
            branch: data.branch || undefined,
          });
          toast.success('User created successfully');
        }
        handleCloseFormModal();
      } catch (err: any) {
        toast.error(err.message ?? 'An error occurred');
      }
    },
    [editingUser, createMutation, updateMutation, handleCloseFormModal]
  );

  const handleToggleActive = useCallback((user: UserWithBranch) => {
    setTogglingUser(user);
  }, []);

  const handleConfirmToggle = useCallback(async () => {
    if (!togglingUser) return;
    try {
      // Use appropriate mutation based on current user state
      if (togglingUser.isActive) {
        await deactivateMutation.mutateAsync(togglingUser._id);
        toast.success('User deactivated successfully');
      } else {
        await activateMutation.mutateAsync(togglingUser._id);
        toast.success('User activated successfully');
      }
      setTogglingUser(null);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update user status');
    }
  }, [togglingUser, deactivateMutation, activateMutation]);

  const handleChangePassword = useCallback((user: UserWithBranch) => {
    setPasswordUser(user);
  }, []);

  const handlePasswordSubmit = useCallback(
    async (newPassword: string) => {
      if (!passwordUser) return;
      try {
        await passwordMutation.mutateAsync({
          id: passwordUser._id,
          payload: { newPassword },
        });
        toast.success('Password changed successfully');
        setPasswordUser(null);
      } catch (err: any) {
        toast.error(err.message ?? 'Failed to change password');
      }
    },
    [passwordUser, passwordMutation]
  );

  const handleClearFilters = useCallback(() => {
    setSearch('');
    setRoleFilter('');
    setStatusFilter('');
    setBranchFilter('');
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  // Reset page when filters change
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleRoleFilterChange = useCallback((value: string) => {
    setRoleFilter(value);
    setPage(1);
  }, []);

  const handleStatusFilterChange = useCallback((value: string) => {
    setStatusFilter(value);
    setPage(1);
  }, []);

  const handleBranchFilterChange = useCallback((value: string) => {
    setBranchFilter(value);
    setPage(1);
  }, []);

  // Access check
  if (!isAdmin()) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="error">
          Access denied. Only administrators can access user management.
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <UsersIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              User Management
            </h1>
            <p className="text-sm text-gray-500">
              Manage system users and their access
            </p>
          </div>
        </div>
        <Button onClick={handleAddUser}>
          <PlusIcon className="mr-2 h-5 w-5" />
          Add User
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <UserFilters
          search={search}
          onSearchChange={handleSearchChange}
          roleFilter={roleFilter}
          onRoleFilterChange={handleRoleFilterChange}
          statusFilter={statusFilter}
          onStatusFilterChange={handleStatusFilterChange}
          branchFilter={branchFilter}
          onBranchFilterChange={handleBranchFilterChange}
          branches={branches}
          onClearFilters={handleClearFilters}
          hasActiveFilters={hasActiveFilters}
        />
      </div>

      {/* Error State */}
      {error && (
        <Alert variant="error" className="mb-6">
          {error.message}
          <Button variant="link" onClick={() => refetch()} className="ml-2">
            Retry
          </Button>
        </Alert>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <UserTable
          users={data?.data ?? []}
          currentUserId={currentUser?._id ?? ''}
          onEdit={handleEditUser}
          onToggleActive={handleToggleActive}
          onChangePassword={handleChangePassword}
          isLoading={isLoading}
        />

        {/* Pagination */}
        {data?.pagination && data.pagination.pages > 1 && (
          <div className="border-t px-4 py-3 dark:border-gray-700">
            <Pagination
              currentPage={data.pagination.page}
              totalPages={data.pagination.pages}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>

      {/* Results Summary */}
      {data?.pagination && (
        <p className="mt-4 text-center text-sm text-gray-500">
          Showing {data.data.length} of {data.pagination.total} users
        </p>
      )}

      {/* Modals */}
      <UserFormModal
        isOpen={showFormModal}
        user={editingUser}
        branches={branches}
        onClose={handleCloseFormModal}
        onSubmit={handleFormSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <ToggleActiveModal
        isOpen={!!togglingUser}
        user={togglingUser}
        onClose={() => setTogglingUser(null)}
        onConfirm={handleConfirmToggle}
        isLoading={deactivateMutation.isPending || activateMutation.isPending}
      />

      <ChangePasswordModal
        isOpen={!!passwordUser}
        user={passwordUser}
        onClose={() => setPasswordUser(null)}
        onSubmit={handlePasswordSubmit}
        isSubmitting={passwordMutation.isPending}
      />
    </div>
  );
}
```

---

### Phase 4: Navbar Update

#### Task F14: Update Navbar with Users Nav Item

**File:** `src/components/layouts/Navbar.tsx`

Add to the `navItems` array:

```typescript
// Add this nav item (place after Branches or in logical order)
{
  label: 'Users',
  href: '/users',
  icon: (
    <svg
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  ),
  roles: ['admin'], // ADMIN ONLY
},
```

---

### Phase 5: Handle Deactivation Response

#### Task F15: Update API Client for Deactivation Handling

**File:** `src/lib/apiClient.ts`

Add handling for "Account is deactivated" 401 response in the interceptor:

```typescript
// In the response error interceptor, add this check BEFORE the token refresh logic:

// Check for deactivated account
if (
  error.response?.status === 401 &&
  error.response?.data?.message?.toLowerCase().includes('deactivated')
) {
  // Account has been deactivated - force logout
  const { logout } = useAuthStore.getState();
  logout();
  
  // Redirect to login with reason
  if (typeof window !== 'undefined') {
    window.location.href = '/login?reason=deactivated';
  }
  
  return Promise.reject(error);
}

// ... existing token refresh logic continues ...
```

---

## Implementation Checklist

### Phase 1: Types & Service Layer

- [ ] **F1.** Create `types/user.ts` with all type definitions
- [ ] **F2.** Extend `lib/services/userService.ts` with new methods (deactivate/activate instead of toggle)
- [ ] **F3.** Create `hooks/useUsers.ts` with React Query hooks (useDeactivateUser/useActivateUser)
- [ ] **F4.** Create `utils/validators/user.ts` with Zod schemas

### Phase 2: Components

- [ ] **F5.** Create `components/users/` directory structure
- [ ] **F6.** Create `components/users/index.ts` barrel export
- [ ] **F7.** Create `UserStatusBadge.tsx`
- [ ] **F8.** Create `UserFilters.tsx`
- [ ] **F9.** Create `UserTable.tsx`
- [ ] **F10.** Create `UserFormModal.tsx`
- [ ] **F11.** Create `ToggleActiveModal.tsx`
- [ ] **F12.** Create `ChangePasswordModal.tsx`

### Phase 3: Users Page

- [ ] **F13.** Create `app/(protected)/users/page.tsx`

### Phase 4: Navigation

- [ ] **F14.** Update `Navbar.tsx` with Users nav item (admin only)

### Phase 5: Security

- [ ] **F15.** Update `apiClient.ts` to handle deactivation 401 response

---

## File Summary

### Files to Create

```
src/
├── types/
│   └── user.ts                            # NEW
├── hooks/
│   └── useUsers.ts                        # NEW
├── utils/validators/
│   └── user.ts                            # NEW
├── components/users/
│   ├── index.ts                           # NEW
│   ├── UserFormModal.tsx                  # NEW
│   ├── UserTable.tsx                      # NEW
│   ├── UserFilters.tsx                    # NEW
│   ├── ToggleActiveModal.tsx              # NEW
│   ├── ChangePasswordModal.tsx            # NEW
│   └── UserStatusBadge.tsx                # NEW
└── app/(protected)/
    └── users/
        └── page.tsx                       # NEW
```

### Files to Update

```
src/
├── lib/
│   ├── services/userService.ts            # UPDATE (extend methods)
│   └── apiClient.ts                       # UPDATE (deactivation handling)
└── components/layouts/
    └── Navbar.tsx                         # UPDATE (add Users nav item)
```

---

## Component Dependencies

```
UsersPage
├── useAuth (existing)
├── useBranches (existing)
├── useUsers (new hook)
├── useCreateUser (new hook)
├── useUpdateUser (new hook)
├── useDeactivateUser (new hook) // replaces useToggleUserActive
├── useActivateUser (new hook)   // replaces useToggleUserActive
├── useChangeUserPassword (new hook)
├── UserFilters
│   ├── Input (existing UI)
│   ├── Select (existing UI)
│   └── Button (existing UI)
├── UserTable
│   ├── Table (existing UI)
│   ├── Dropdown (existing UI)
│   ├── Button (existing UI)
│   └── UserStatusBadge
├── UserFormModal
│   ├── Modal (existing UI)
│   ├── Input (existing UI)
│   ├── Select (existing UI)
│   ├── Button (existing UI)
│   └── FormField (existing UI)
├── ToggleActiveModal
│   ├── Modal (existing UI)
│   └── Button (existing UI)
├── ChangePasswordModal
│   ├── Modal (existing UI)
│   ├── Input (existing UI)
│   ├── Button (existing UI)
│   └── FormField (existing UI)
└── Pagination (existing UI)
```

---

## Timeline Estimate

| Day | Tasks |
|-----|-------|
| Day 1 | F1-F4: Types, service, hooks, validators |
| Day 2 | F5-F12: All components |
| Day 3 | F13-F15: Users page, navbar, apiClient, testing |

**Total:** 2-3 days

---

**End of Frontend User Management Plan**
