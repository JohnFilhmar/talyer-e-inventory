/**
 * Category types for Frontend Phase 3
 * Matches backend Category model schema
 */

/**
 * Category parent reference (populated)
 */
export interface CategoryParent {
  _id: string;
  name: string;
  code: string;
}

/**
 * Main Category interface matching backend model
 */
export interface Category {
  _id: string;
  name: string;
  code: string;
  description?: string;
  parent?: CategoryParent | string | null;
  image?: string;
  color?: string;
  sortOrder: number;
  isActive: boolean;
  fullPath?: string;
  productCount?: number;
  children?: Category[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Payload for creating a new category
 */
export interface CreateCategoryPayload {
  name: string;
  code?: string;
  description?: string;
  parent?: string | null;
  image?: string;
  color?: string;
  sortOrder?: number;
}

/**
 * Payload for updating a category
 */
export interface UpdateCategoryPayload {
  name?: string;
  code?: string;
  description?: string;
  parent?: string | null;
  image?: string;
  color?: string;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * Query parameters for category list endpoint
 */
export interface CategoryListParams {
  parent?: string | 'null';
  active?: string;
  includeChildren?: string;
}

/**
 * Pre-defined color palette for category colors
 */
export const CATEGORY_COLORS = [
  { name: 'Red', value: '#EF4444' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Amber', value: '#F59E0B' },
  { name: 'Yellow', value: '#EAB308' },
  { name: 'Lime', value: '#84CC16' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Emerald', value: '#10B981' },
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Sky', value: '#0EA5E9' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Violet', value: '#8B5CF6' },
  { name: 'Purple', value: '#A855F7' },
  { name: 'Fuchsia', value: '#D946EF' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Rose', value: '#F43F5E' },
  { name: 'Gray', value: '#6B7280' },
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number]['value'];
