import { z } from 'zod';
import { CATEGORY_COLORS, type CategoryColor } from '@/types/category';

/**
 * Category code validation regex
 * Uppercase alphanumeric with hyphens allowed
 * Example: ELEC-001, TOOLS-POWER
 */
const categoryCodeRegex = /^[A-Z0-9-]+$/;

/**
 * Valid color values from the predefined palette
 */
const validColors = CATEGORY_COLORS.map((c) => c.value) as [CategoryColor, ...CategoryColor[]];

/**
 * Create category form schema
 */
export const createCategorySchema = z.object({
  name: z
    .string()
    .min(1, 'Category name is required')
    .min(2, 'Category name must be at least 2 characters')
    .max(100, 'Category name must not exceed 100 characters'),
  code: z
    .string()
    .max(30, 'Category code must not exceed 30 characters')
    .regex(categoryCodeRegex, 'Category code must be uppercase alphanumeric (hyphens allowed)')
    .transform((val) => val.toUpperCase())
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .max(500, 'Description must not exceed 500 characters')
    .optional()
    .or(z.literal('')),
  parent: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val === '' ? null : val)),
  image: z
    .string()
    .url('Must be a valid URL')
    .optional()
    .or(z.literal('')),
  color: z
    .enum(validColors)
    .optional()
    .or(z.literal('')),
  sortOrder: z
    .number()
    .int('Sort order must be a whole number')
    .min(0, 'Sort order cannot be negative')
    .max(9999, 'Sort order cannot exceed 9999')
    .optional(),
});

/**
 * Update category form schema (all fields optional)
 */
export const updateCategorySchema = z.object({
  name: z
    .string()
    .min(2, 'Category name must be at least 2 characters')
    .max(100, 'Category name must not exceed 100 characters')
    .optional(),
  code: z
    .string()
    .max(30, 'Category code must not exceed 30 characters')
    .regex(categoryCodeRegex, 'Category code must be uppercase alphanumeric (hyphens allowed)')
    .transform((val) => val.toUpperCase())
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .max(500, 'Description must not exceed 500 characters')
    .optional()
    .or(z.literal('')),
  parent: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val === '' ? null : val)),
  image: z
    .string()
    .url('Must be a valid URL')
    .optional()
    .or(z.literal('')),
  color: z
    .enum(validColors)
    .optional()
    .or(z.literal('')),
  sortOrder: z
    .number()
    .int('Sort order must be a whole number')
    .min(0, 'Sort order cannot be negative')
    .max(9999, 'Sort order cannot exceed 9999')
    .optional(),
  isActive: z.boolean().optional(),
});

/**
 * Type inference for form data
 */
export type CreateCategoryFormData = z.infer<typeof createCategorySchema>;
export type UpdateCategoryFormData = z.infer<typeof updateCategorySchema>;
