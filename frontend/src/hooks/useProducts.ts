import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productService } from '@/lib/services/productService';
import type {
  Product,
  ProductImage,
  ProductListParams,
  ProductSearchParams,
  ProductSearchResult,
  CreateProductPayload,
  UpdateProductPayload,
} from '@/types/product';
import type { PaginatedResponse } from '@/types/api';

/**
 * Query keys for product-related queries
 */
export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (params: ProductListParams) => [...productKeys.lists(), params] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
  search: (params: ProductSearchParams) => [...productKeys.all, 'search', params] as const,
};

/**
 * Custom hook for debouncing values
 * @param value - Value to debounce
 * @param delay - Delay in milliseconds (default 600ms)
 */
export function useDebounce<T>(value: T, delay = 600): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook to fetch paginated product list with filters
 */
export function useProducts(params: ProductListParams = {}) {
  return useQuery<PaginatedResponse<Product>, Error>({
    queryKey: productKeys.list(params),
    queryFn: () => productService.getAll(params),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch a single product by ID
 */
export function useProduct(id: string | undefined) {
  return useQuery<Product, Error>({
    queryKey: productKeys.detail(id ?? ''),
    queryFn: () => productService.getById(id!),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook for quick product search with 600ms debounce
 * @param query - Search query string
 * @param limit - Maximum results (default 10)
 */
export function useProductSearch(query: string, limit = 10) {
  const debouncedQuery = useDebounce(query, 600);

  return useQuery<ProductSearchResult[], Error>({
    queryKey: productKeys.search({ q: debouncedQuery, limit }),
    queryFn: () => productService.search({ q: debouncedQuery, limit }),
    enabled: debouncedQuery.length >= 2, // Only search with 2+ characters
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData, // Keep previous data while loading
  });
}

/**
 * Hook to create a new product
 */
export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation<Product, Error, CreateProductPayload>({
    mutationFn: (payload) => productService.create(payload),
    onSuccess: () => {
      // Invalidate product lists to refetch
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

/**
 * Hook to update an existing product
 */
export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation<Product, Error, { id: string; payload: UpdateProductPayload }>({
    mutationFn: ({ id, payload }) => productService.update(id, payload),
    onSuccess: (updatedProduct) => {
      // Invalidate and refetch the specific product
      queryClient.invalidateQueries({ queryKey: productKeys.detail(updatedProduct._id) });
      // Invalidate product lists
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

/**
 * Hook to delete a product
 */
export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => productService.delete(id),
    onSuccess: (_, id) => {
      // Invalidate the deleted product
      queryClient.invalidateQueries({ queryKey: productKeys.detail(id) });
      // Invalidate product lists
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

/**
 * Hook to upload an image to a product
 */
export function useUploadProductImage() {
  const queryClient = useQueryClient();

  return useMutation<ProductImage, Error, { productId: string; file: File; isPrimary?: boolean }>({
    mutationFn: ({ productId, file, isPrimary }) =>
      productService.uploadImage(productId, file, isPrimary),
    onSuccess: (_, { productId }) => {
      // Invalidate and refetch the product to get updated images
      queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) });
    },
  });
}

/**
 * Hook to add an image by URL (legacy)
 */
export function useAddProductImageByUrl() {
  const queryClient = useQueryClient();

  return useMutation<ProductImage, Error, { productId: string; url: string; isPrimary?: boolean }>({
    mutationFn: ({ productId, url, isPrimary }) =>
      productService.addImageByUrl(productId, url, isPrimary),
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) });
    },
  });
}

/**
 * Hook to delete a product image
 */
export function useDeleteProductImage() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { productId: string; imageId: string }>({
    mutationFn: ({ productId, imageId }) => productService.deleteImage(productId, imageId),
    onSuccess: (_, { productId }) => {
      // Invalidate and refetch the product
      queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) });
    },
  });
}

/**
 * Hook to set a product image as primary
 */
export function useSetProductImageAsPrimary() {
  const queryClient = useQueryClient();

  return useMutation<
    Product,
    Error,
    { productId: string; imageId: string; currentImages: ProductImage[] }
  >({
    mutationFn: ({ productId, imageId, currentImages }) =>
      productService.setImageAsPrimary(productId, imageId, currentImages),
    onSuccess: (updatedProduct) => {
      // Invalidate and refetch the product
      queryClient.invalidateQueries({ queryKey: productKeys.detail(updatedProduct._id) });
    },
  });
}
