import apiClient from '@/lib/apiClient';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  Branch,
  BranchStats,
  CreateBranchPayload,
  UpdateBranchPayload,
  BranchListParams,
} from '@/types/branch';

/**
 * Branch service
 * Handles all branch-related API calls
 */
export const branchService = {
  /**
   * Get all branches with optional filters
   */
  async getAll(params: BranchListParams = {}): Promise<PaginatedResponse<Branch>> {
    const { data } = await apiClient.get<ApiResponse<Branch[]>>('/branches', {
      params,
    });

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },

  /**
   * Get a single branch by ID
   */
  async getById(id: string): Promise<Branch> {
    const { data } = await apiClient.get<ApiResponse<Branch>>(`/branches/${id}`);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to fetch branch');
    }

    return data.data;
  },

  /**
   * Create a new branch (admin only)
   */
  async create(payload: CreateBranchPayload): Promise<Branch> {
    const { data } = await apiClient.post<ApiResponse<Branch>>('/branches', payload);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to create branch');
    }

    return data.data;
  },

  /**
   * Update an existing branch (admin only)
   */
  async update(id: string, payload: UpdateBranchPayload): Promise<Branch> {
    const { data } = await apiClient.put<ApiResponse<Branch>>(`/branches/${id}`, payload);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to update branch');
    }

    return data.data;
  },

  /**
   * Deactivate a branch (soft delete, admin only)
   */
  async deactivate(id: string): Promise<{ id: string; name: string; isActive: boolean }> {
    const { data } = await apiClient.delete<
      ApiResponse<{ id: string; name: string; isActive: boolean }>
    >(`/branches/${id}`);

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to deactivate branch');
    }

    return data.data ?? { id, name: '', isActive: false };
  },

  /**
   * Get branch statistics
   */
  async getStats(id: string): Promise<BranchStats> {
    const { data } = await apiClient.get<ApiResponse<BranchStats>>(
      `/branches/${id}/stats`
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to fetch branch statistics');
    }

    return data.data;
  },

  /**
   * Activate a previously deactivated branch (admin only)
   */
  async activate(id: string): Promise<Branch> {
    const { data } = await apiClient.put<ApiResponse<Branch>>(`/branches/${id}`, {
      isActive: true,
    });

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to activate branch');
    }

    return data.data;
  },
};

export default branchService;
