import apiClient from '@/lib/apiClient';
import type { ApiResponse } from '@/types/api';
import type {
  Category,
  CreateCategoryPayload,
  UpdateCategoryPayload,
  CategoryListParams,
} from '@/types/category';

/**
 * Category service
 * Handles all category-related API calls
 */
export const categoryService = {
  /**
   * Get all categories with optional filters
   * @param params - Filter parameters (parent, active, includeChildren)
   */
  async getAll(params: CategoryListParams = {}): Promise<Category[]> {
    const { data } = await apiClient.get<ApiResponse<Category[]>>('/categories', {
      params,
    });

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to fetch categories');
    }

    return data.data ?? [];
  },

  /**
   * Get root categories (categories with no parent)
   */
  async getRootCategories(): Promise<Category[]> {
    return categoryService.getAll({ parent: 'null', includeChildren: 'true' });
  },

  /**
   * Get all active categories (for dropdowns/selectors)
   */
  async getActiveCategories(): Promise<Category[]> {
    return categoryService.getAll({ active: 'true' });
  },

  /**
   * Get a single category by ID
   * @param id - Category ID
   */
  async getById(id: string): Promise<Category> {
    const { data } = await apiClient.get<ApiResponse<Category>>(`/categories/${id}`);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to fetch category');
    }

    return data.data;
  },

  /**
   * Get children of a category
   * @param id - Parent category ID
   */
  async getChildren(id: string): Promise<Category[]> {
    const { data } = await apiClient.get<ApiResponse<Category[]>>(
      `/categories/${id}/children`
    );

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to fetch category children');
    }

    return data.data ?? [];
  },

  /**
   * Create a new category (admin only)
   * @param payload - Category data
   */
  async create(payload: CreateCategoryPayload): Promise<Category> {
    const { data } = await apiClient.post<ApiResponse<Category>>('/categories', payload);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to create category');
    }

    return data.data;
  },

  /**
   * Update an existing category (admin only)
   * @param id - Category ID
   * @param payload - Updated category data
   */
  async update(id: string, payload: UpdateCategoryPayload): Promise<Category> {
    const { data } = await apiClient.put<ApiResponse<Category>>(
      `/categories/${id}`,
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to update category');
    }

    return data.data;
  },

  /**
   * Delete a category (admin only)
   * Note: Will fail if category has products or children
   * @param id - Category ID
   */
  async delete(id: string): Promise<void> {
    const { data } = await apiClient.delete<ApiResponse<null>>(`/categories/${id}`);

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to delete category');
    }
  },

  /**
   * Build a flat list from hierarchical category tree
   * Useful for dropdowns with indentation
   * @param categories - Category tree
   * @param level - Current nesting level
   */
  flattenTree(categories: Category[], level = 0): Array<Category & { level: number }> {
    const result: Array<Category & { level: number }> = [];

    for (const category of categories) {
      result.push({ ...category, level });
      if (category.children && category.children.length > 0) {
        result.push(...categoryService.flattenTree(category.children, level + 1));
      }
    }

    return result;
  },
};
