/**
 * Product types for Frontend Phase 3
 * Matches backend Product model schema
 */

import type { Category } from './category';

/**
 * Product image subdocument
 */
export interface ProductImage {
  _id: string;
  url: string;
  isPrimary: boolean;
}

/**
 * Product specifications - strongly typed common fields
 */
export interface ProductSpecifications {
  weight?: number;
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
  };
  color?: string;
  material?: string;
  warranty?: string;
  origin?: string;
  [key: string]: string | number | { length?: number; width?: number; height?: number } | undefined;
}

/**
 * Category reference in product (populated)
 */
export interface ProductCategory {
  _id: string;
  name: string;
  code: string;
  color?: string;
}

/**
 * Main Product interface matching backend model
 */
export interface Product {
  _id: string;
  sku: string;
  name: string;
  description?: string;
  category: ProductCategory | string;
  brand?: string;
  model?: string;
  costPrice: number;
  sellingPrice: number;
  barcode?: string;
  images: ProductImage[];
  specifications?: ProductSpecifications;
  isActive: boolean;
  isDiscontinued: boolean;
  tags: string[];
  /** Virtual field - URL of primary image */
  primaryImage?: string;
  /** Virtual field - calculated profit margin percentage */
  profitMargin: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Image input for product creation (URL-based, legacy)
 */
export interface ProductImageInput {
  url: string;
  isPrimary?: boolean;
}

/**
 * Payload for creating a new product
 */
export interface CreateProductPayload {
  sku?: string;
  name: string;
  description?: string;
  category: string;
  brand?: string;
  model?: string;
  costPrice: number;
  sellingPrice: number;
  barcode?: string;
  images?: ProductImageInput[];
  specifications?: ProductSpecifications;
  tags?: string[];
}

/**
 * Payload for updating a product
 */
export interface UpdateProductPayload {
  sku?: string;
  name?: string;
  description?: string;
  category?: string;
  brand?: string;
  model?: string;
  costPrice?: number;
  sellingPrice?: number;
  barcode?: string;
  images?: ProductImageInput[];
  specifications?: ProductSpecifications;
  tags?: string[];
  isActive?: boolean;
  isDiscontinued?: boolean;
}

/**
 * Query parameters for product list endpoint
 */
export interface ProductListParams {
  category?: string;
  brand?: string;
  active?: string;
  discontinued?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'sellingPrice' | 'costPrice' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Search query parameters
 */
export interface ProductSearchParams {
  q: string;
  limit?: number;
}

/**
 * Response from product search endpoint
 */
export interface ProductSearchResult {
  _id: string;
  sku: string;
  name: string;
  brand?: string;
  sellingPrice: number;
  images: ProductImage[];
  category: ProductCategory;
}

/**
 * Image upload response
 */
export interface ImageUploadResponse {
  url: string;
  filename: string;
  size: number;
}

/**
 * Type guard to check if category is populated
 */
export function isPopulatedCategory(
  category: ProductCategory | string | undefined
): category is ProductCategory {
  return category !== undefined && typeof category === 'object' && '_id' in category;
}

/**
 * Calculate profit margin from cost and selling price
 */
export function calculateProfitMargin(costPrice: number, sellingPrice: number): number {
  if (costPrice === 0) return 0;
  return Math.round(((sellingPrice - costPrice) / costPrice) * 100 * 100) / 100;
}
