import apiClient from '@/lib/apiClient';
import type { ApiResponse } from '@/types/api';
import type { User as AuthUser } from '@/types/auth';
import type { ManagerListResponse } from '@/types/branch';
import type {
  User,
  UserListParams,
  UserListResponse,
  CreateUserPayload,
  UpdateUserPayload,
  ChangePasswordPayload,
} from '@/types/user';

/**
 * User service
 * Handles user-related API calls
 */
export const userService = {
  /**
   * Get paginated list of users with filters (admin only)
   */
  async getUsers(params: UserListParams = {}): Promise<UserListResponse> {
    const { data } = await apiClient.get<ApiResponse<User[]>>('/users', {
      params,
    });

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to fetch users');
    }

    return {
      users: (data.data ?? []) as User[],
      pagination: data.pagination ?? {
        page: 1,
        limit: 10,
        total: 0,
        pages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  },

  /**
   * Get all users (admin only) - legacy method for compatibility
   */
  async getAll(): Promise<AuthUser[]> {
    const { data } = await apiClient.get<ApiResponse<AuthUser[]>>('/users');

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to fetch users');
    }

    return data.data ?? [];
  },

  /**
   * Get users that can be branch managers (admin and salesperson roles)
   * This is used for the manager dropdown in branch forms
   */
  async getManagers(): Promise<ManagerListResponse> {
    const { data } = await apiClient.get<ApiResponse<AuthUser[]>>('/users');

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to fetch users');
    }

    // Filter to only admin and salesperson roles who are active
    const managers = (data.data ?? []).filter(
      (user) =>
        (user.role === 'admin' || user.role === 'salesperson') && user.isActive
    );

    return managers.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    }));
  },

  /**
   * Get a single user by ID (admin only)
   */
  async getById(id: string): Promise<User> {
    const { data } = await apiClient.get<ApiResponse<User>>(`/users/${id}`);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to fetch user');
    }

    return data.data;
  },

  /**
   * Create a new user (admin only)
   */
  async create(payload: CreateUserPayload): Promise<User> {
    const { data } = await apiClient.post<ApiResponse<User>>('/users', payload);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to create user');
    }

    return data.data;
  },

  /**
   * Update an existing user (admin only)
   * Note: Does NOT handle isActive - use deactivate/activate methods
   * Note: Does NOT handle password - use changePassword method
   */
  async update(id: string, payload: UpdateUserPayload): Promise<User> {
    const { data } = await apiClient.put<ApiResponse<User>>(`/users/${id}`, payload);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to update user');
    }

    return data.data;
  },

  /**
   * Deactivate a user (admin only)
   * Prevents the user from logging in
   */
  async deactivate(id: string): Promise<User> {
    const { data } = await apiClient.patch<ApiResponse<User>>(`/users/${id}/deactivate`);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to deactivate user');
    }

    return data.data;
  },

  /**
   * Activate a previously deactivated user (admin only)
   * Allows the user to log in again
   */
  async activate(id: string): Promise<User> {
    const { data } = await apiClient.patch<ApiResponse<User>>(`/users/${id}/activate`);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to activate user');
    }

    return data.data;
  },

  /**
   * Change a user's password (admin only)
   * Used when admin needs to reset a user's password
   */
  async changePassword(id: string, payload: ChangePasswordPayload): Promise<{ message: string }> {
    const { data } = await apiClient.patch<ApiResponse<void>>(
      `/users/${id}/password`,
      payload
    );

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to change password');
    }

    return { message: data.message };
  },
};

export default userService;
