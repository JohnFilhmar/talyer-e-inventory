import apiClient from '@/lib/apiClient';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  Supplier,
  CreateSupplierPayload,
  UpdateSupplierPayload,
  SupplierListParams,
} from '@/types/supplier';

/**
 * Supplier service
 * Handles all supplier-related API calls
 */
export const supplierService = {
  /**
   * Get all suppliers with optional filters
   * @param params - Filter parameters (active, search)
   */
  async getAll(params: SupplierListParams = {}): Promise<PaginatedResponse<Supplier>> {
    const { data } = await apiClient.get<ApiResponse<Supplier[]>>('/suppliers', {
      params,
    });

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },

  /**
   * Get active suppliers (for dropdown selection)
   */
  async getActive(): Promise<Supplier[]> {
    const { data } = await apiClient.get<ApiResponse<Supplier[]>>('/suppliers', {
      params: { active: 'true', limit: 100 },
    });

    return data.data ?? [];
  },

  /**
   * Get a single supplier by ID
   * @param id - Supplier ID
   */
  async getById(id: string): Promise<Supplier> {
    const { data } = await apiClient.get<ApiResponse<Supplier>>(
      `/suppliers/${id}`
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to fetch supplier');
    }

    return data.data;
  },

  /**
   * Create a new supplier (admin only)
   * @param payload - Supplier data
   */
  async create(payload: CreateSupplierPayload): Promise<Supplier> {
    const { data } = await apiClient.post<ApiResponse<Supplier>>(
      '/suppliers',
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to create supplier');
    }

    return data.data;
  },

  /**
   * Update an existing supplier (admin only)
   * @param id - Supplier ID
   * @param payload - Updated supplier data
   */
  async update(id: string, payload: UpdateSupplierPayload): Promise<Supplier> {
    const { data } = await apiClient.put<ApiResponse<Supplier>>(
      `/suppliers/${id}`,
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to update supplier');
    }

    return data.data;
  },

  /**
   * Deactivate a supplier (soft delete, admin only)
   * @param id - Supplier ID
   */
  async deactivate(id: string): Promise<void> {
    const { data } = await apiClient.delete<ApiResponse<null>>(
      `/suppliers/${id}`
    );

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to deactivate supplier');
    }
  },
};
