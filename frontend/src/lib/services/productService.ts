import apiClient from '@/lib/apiClient';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  Product,
  ProductImage,
  CreateProductPayload,
  UpdateProductPayload,
  ProductListParams,
  ProductSearchParams,
  ProductSearchResult,
} from '@/types/product';

/**
 * Product service
 * Handles all product-related API calls
 */
export const productService = {
  /**
   * Get all products with pagination and filters
   * @param params - Filter and pagination parameters
   */
  async getAll(params: ProductListParams = {}): Promise<PaginatedResponse<Product>> {
    const { data } = await apiClient.get<ApiResponse<Product[]>>('/api/products', {
      params,
    });

    return {
      data: data.data ?? [],
      pagination: data.pagination,
    };
  },

  /**
   * Get a single product by ID
   * @param id - Product ID
   */
  async getById(id: string): Promise<Product> {
    const { data } = await apiClient.get<ApiResponse<Product>>(`/api/products/${id}`);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to fetch product');
    }

    return data.data;
  },

  /**
   * Search products (quick search endpoint)
   * @param params - Search query and limit
   */
  async search(params: ProductSearchParams): Promise<ProductSearchResult[]> {
    const { data } = await apiClient.get<ApiResponse<ProductSearchResult[]>>(
      '/api/products/search',
      { params }
    );

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to search products');
    }

    return data.data ?? [];
  },

  /**
   * Create a new product (admin only)
   * @param payload - Product data
   */
  async create(payload: CreateProductPayload): Promise<Product> {
    const { data } = await apiClient.post<ApiResponse<Product>>('/api/products', payload);

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to create product');
    }

    return data.data;
  },

  /**
   * Update an existing product (admin only)
   * @param id - Product ID
   * @param payload - Updated product data
   */
  async update(id: string, payload: UpdateProductPayload): Promise<Product> {
    const { data } = await apiClient.put<ApiResponse<Product>>(
      `/api/products/${id}`,
      payload
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to update product');
    }

    return data.data;
  },

  /**
   * Delete a product (soft delete, admin only)
   * @param id - Product ID
   */
  async delete(id: string): Promise<void> {
    const { data } = await apiClient.delete<ApiResponse<null>>(`/api/products/${id}`);

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to delete product');
    }
  },

  /**
   * Upload an image to a product (admin only)
   * Uses FormData for file upload with server-side compression
   * @param productId - Product ID
   * @param file - Image file to upload
   * @param isPrimary - Whether this should be the primary image
   */
  async uploadImage(
    productId: string,
    file: File,
    isPrimary = false
  ): Promise<ProductImage> {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('isPrimary', String(isPrimary));

    const { data } = await apiClient.post<ApiResponse<ProductImage>>(
      `/api/products/${productId}/images`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to upload image');
    }

    return data.data;
  },

  /**
   * Add an image by URL (legacy method)
   * @param productId - Product ID
   * @param url - Image URL
   * @param isPrimary - Whether this should be the primary image
   */
  async addImageByUrl(
    productId: string,
    url: string,
    isPrimary = false
  ): Promise<ProductImage> {
    const { data } = await apiClient.post<ApiResponse<ProductImage>>(
      `/api/products/${productId}/images/url`,
      { url, isPrimary }
    );

    if (!data.success || !data.data) {
      throw new Error(data.message ?? 'Failed to add image');
    }

    return data.data;
  },

  /**
   * Delete an image from a product (admin only)
   * @param productId - Product ID
   * @param imageId - Image ID to delete
   */
  async deleteImage(productId: string, imageId: string): Promise<void> {
    const { data } = await apiClient.delete<ApiResponse<null>>(
      `/api/products/${productId}/images/${imageId}`
    );

    if (!data.success) {
      throw new Error(data.message ?? 'Failed to delete image');
    }
  },

  /**
   * Set an image as primary
   * This is done by updating the product with modified images array
   * @param productId - Product ID  
   * @param imageId - Image ID to set as primary
   * @param currentImages - Current images array
   */
  async setImageAsPrimary(
    productId: string,
    imageId: string,
    currentImages: ProductImage[]
  ): Promise<Product> {
    const updatedImages = currentImages.map((img) => ({
      url: img.url,
      isPrimary: img._id === imageId,
    }));

    return productService.update(productId, { images: updatedImages });
  },
};
