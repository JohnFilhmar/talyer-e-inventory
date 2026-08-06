import apiClient from '@/lib/apiClient';
import type { ApiResponse } from '@/types/api';
import type {
  MotorcycleModel,
  CreateMotorcycleModelPayload,
  UpdateMotorcycleModelPayload,
  MotorcycleModelListParams,
} from '@/types/motorcycleModel';

/**
 * Motorcycle model service
 * Handles all motorcycle-model-related API calls
 */
export const motorcycleModelService = {
  /**
   * Get all motorcycle models with optional filters
   * @param params - Filter parameters (make, active, search)
   */
  async getAll(params: MotorcycleModelListParams = {}): Promise<MotorcycleModel[]> {
    const { data } = await apiClient.get<ApiResponse<MotorcycleModel[]>>(
      '/motorcycle-models',
      { params }
    );

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to fetch motorcycle models');
    }

    return data.data ?? [];
  },

  /**
   * Get all active motorcycle models (for pickers and filter dropdowns)
   */
  async getActive(): Promise<MotorcycleModel[]> {
    return motorcycleModelService.getAll({ active: 'true' });
  },

  /**
   * Get the distinct list of makes, for grouping a picker by manufacturer
   */
  async getMakes(activeOnly = false): Promise<string[]> {
    const { data } = await apiClient.get<ApiResponse<string[]>>(
      '/motorcycle-models/makes',
      { params: activeOnly ? { active: 'true' } : {} }
    );

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to fetch motorcycle makes');
    }

    return data.data ?? [];
  },

  /**
   * Get a single motorcycle model by ID
   * @param id - Motorcycle model ID
   */
  async getById(id: string): Promise<MotorcycleModel> {
    const { data } = await apiClient.get<ApiResponse<MotorcycleModel>>(
      `/motorcycle-models/${id}`
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to fetch motorcycle model');
    }

    return data.data;
  },

  /**
   * Create a new motorcycle model (admin only)
   * @param payload - Motorcycle model data
   */
  async create(payload: CreateMotorcycleModelPayload): Promise<MotorcycleModel> {
    const { data } = await apiClient.post<ApiResponse<MotorcycleModel>>(
      '/motorcycle-models',
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to create motorcycle model');
    }

    return data.data;
  },

  /**
   * Update an existing motorcycle model (admin only)
   * @param id - Motorcycle model ID
   * @param payload - Updated data
   */
  async update(
    id: string,
    payload: UpdateMotorcycleModelPayload
  ): Promise<MotorcycleModel> {
    const { data } = await apiClient.put<ApiResponse<MotorcycleModel>>(
      `/motorcycle-models/${id}`,
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to update motorcycle model');
    }

    return data.data;
  },

  /**
   * Deactivate a motorcycle model (admin only)
   * Note: Will fail if any products are assigned to it
   * @param id - Motorcycle model ID
   */
  async delete(id: string): Promise<void> {
    const { data } = await apiClient.delete<ApiResponse<null>>(
      `/motorcycle-models/${id}`
    );

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to delete motorcycle model');
    }
  },
};
