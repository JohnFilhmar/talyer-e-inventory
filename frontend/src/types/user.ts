/**
 * User types for User Management feature
 * Aligned with backend User model and API responses
 */

import type { PaginationInfo } from './api';

/**
 * User role type (matches backend UserRole enum)
 */
export type UserRole = 'admin' | 'salesperson' | 'mechanic' | 'customer';

/**
 * Full User interface matching backend User model
 */
export interface User {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  branch?: {
    _id: string;
    name: string;
  } | null;
  permissions: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * User list query parameters
 */
export interface UserListParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  branch?: string;
  sortBy?: 'name' | 'email' | 'role' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated user list response
 */
export interface UserListResponse {
  users: User[];
  pagination: PaginationInfo;
}

/**
 * Create user payload (admin only)
 */
export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  branch?: string; // Required for salesperson/mechanic roles
}

/**
 * Update user payload (admin only)
 * Note: isActive is NOT included - use separate deactivate/activate endpoints
 * Note: password is NOT included - use separate changePassword endpoint
 */
export interface UpdateUserPayload {
  name?: string;
  email?: string;
  role?: UserRole;
  branch?: string | null; // null to remove branch assignment
}

/**
 * Change password payload (admin changing another user's password)
 */
export interface ChangePasswordPayload {
  newPassword: string;
}

/**
 * Deactivate/Activate response
 */
export interface ToggleActiveResponse {
  user: User;
}

/**
 * User for display in lists (simplified)
 */
export interface UserListItem {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  branch?: {
    _id: string;
    name: string;
  } | null;
  isActive: boolean;
  createdAt: string;
}

/**
 * Role display configuration
 */
export const ROLE_DISPLAY: Record<UserRole, { label: string; color: string }> = {
  admin: { label: 'Administrator', color: 'purple' },
  salesperson: { label: 'Salesperson', color: 'blue' },
  mechanic: { label: 'Mechanic', color: 'green' },
  customer: { label: 'Customer', color: 'gray' },
};

/**
 * Roles that require a branch assignment
 */
export const ROLES_REQUIRING_BRANCH: UserRole[] = ['salesperson', 'mechanic'];

/**
 * Check if a role requires branch assignment
 */
export function roleRequiresBranch(role: UserRole): boolean {
  return ROLES_REQUIRING_BRANCH.includes(role);
}
