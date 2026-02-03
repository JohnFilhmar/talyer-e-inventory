import { z } from 'zod';

/**
 * SKU validation regex
 * Uppercase alphanumeric with hyphens allowed
 * Example: PROD-000001, SKU-ELEC-001
 */
const skuRegex = /^[A-Z0-9-]+$/;

/**
 * Barcode validation regex (EAN-13, UPC-A, or custom)
 * Allows digits, some may include dashes
 */
const barcodeRegex = /^[\d-]+$/;

/**
 * Product specifications schema
 */
export const productSpecificationsSchema = z.object({
  weight: z
    .number()
    .positive('Weight must be positive')
    .optional(),
  dimensions: z.object({
    length: z.number().positive('Length must be positive').optional(),
    width: z.number().positive('Width must be positive').optional(),
    height: z.number().positive('Height must be positive').optional(),
  }).optional(),
  color: z
    .string()
    .max(50, 'Color must not exceed 50 characters')
    .optional()
    .or(z.literal('')),
  material: z
    .string()
    .max(100, 'Material must not exceed 100 characters')
    .optional()
    .or(z.literal('')),
  warranty: z
    .string()
    .max(100, 'Warranty must not exceed 100 characters')
    .optional()
    .or(z.literal('')),
  origin: z
    .string()
    .max(100, 'Origin must not exceed 100 characters')
    .optional()
    .or(z.literal('')),
});

/**
 * Base product fields shared between create and update
 */
const baseProductFields = {
  name: z
    .string()
    .min(1, 'Product name is required')
    .min(2, 'Product name must be at least 2 characters')
    .max(200, 'Product name must not exceed 200 characters'),
  sku: z
    .string()
    .max(50, 'SKU must not exceed 50 characters')
    .regex(skuRegex, 'SKU must be uppercase alphanumeric (hyphens allowed)')
    .transform((val) => val.toUpperCase())
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .max(2000, 'Description must not exceed 2000 characters')
    .optional()
    .or(z.literal('')),
  category: z
    .string()
    .min(1, 'Category is required'),
  brand: z
    .string()
    .max(100, 'Brand must not exceed 100 characters')
    .optional()
    .or(z.literal('')),
  model: z
    .string()
    .max(100, 'Model must not exceed 100 characters')
    .optional()
    .or(z.literal('')),
  costPrice: z
    .number()
    .min(0, 'Cost price cannot be negative'),
  sellingPrice: z
    .number()
    .min(0, 'Selling price cannot be negative'),
  barcode: z
    .string()
    .max(50, 'Barcode must not exceed 50 characters')
    .regex(barcodeRegex, 'Barcode must be numeric (hyphens allowed)')
    .optional()
    .or(z.literal('')),
  specifications: productSpecificationsSchema.optional(),
  tags: z
    .array(z.string().max(50, 'Tag must not exceed 50 characters'))
    .max(20, 'Cannot have more than 20 tags')
    .optional(),
};

/**
 * Create product form schema
 * Includes refinement for sellingPrice >= costPrice
 */
export const createProductSchema = z.object(baseProductFields).refine(
  (data) => data.sellingPrice >= data.costPrice,
  {
    message: 'Selling price must be greater than or equal to cost price',
    path: ['sellingPrice'],
  }
);

/**
 * Update product form schema (all fields optional except the refinement)
 */
export const updateProductSchema = z.object({
  name: z
    .string()
    .min(2, 'Product name must be at least 2 characters')
    .max(200, 'Product name must not exceed 200 characters')
    .optional(),
  sku: z
    .string()
    .max(50, 'SKU must not exceed 50 characters')
    .regex(skuRegex, 'SKU must be uppercase alphanumeric (hyphens allowed)')
    .transform((val) => val.toUpperCase())
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .max(2000, 'Description must not exceed 2000 characters')
    .optional()
    .or(z.literal('')),
  category: z
    .string()
    .min(1, 'Category is required')
    .optional(),
  brand: z
    .string()
    .max(100, 'Brand must not exceed 100 characters')
    .optional()
    .or(z.literal('')),
  model: z
    .string()
    .max(100, 'Model must not exceed 100 characters')
    .optional()
    .or(z.literal('')),
  costPrice: z
    .number()
    .min(0, 'Cost price cannot be negative')
    .optional(),
  sellingPrice: z
    .number()
    .min(0, 'Selling price cannot be negative')
    .optional(),
  barcode: z
    .string()
    .max(50, 'Barcode must not exceed 50 characters')
    .regex(barcodeRegex, 'Barcode must be numeric (hyphens allowed)')
    .optional()
    .or(z.literal('')),
  specifications: productSpecificationsSchema.optional(),
  tags: z
    .array(z.string().max(50, 'Tag must not exceed 50 characters'))
    .max(20, 'Cannot have more than 20 tags')
    .optional(),
  isActive: z.boolean().optional(),
  isDiscontinued: z.boolean().optional(),
}).refine(
  (data) => {
    // Only validate if both prices are provided
    if (data.costPrice !== undefined && data.sellingPrice !== undefined) {
      return data.sellingPrice >= data.costPrice;
    }
    return true;
  },
  {
    message: 'Selling price must be greater than or equal to cost price',
    path: ['sellingPrice'],
  }
);

/**
 * Image upload validation schema
 */
export const imageUploadSchema = z.object({
  file: z
    .instanceof(File, { message: 'Please select a file' })
    .refine((file) => file.size <= 5 * 1024 * 1024, 'File size must be less than 5MB')
    .refine(
      (file) => ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type),
      'File must be an image (JPEG, PNG, WebP, or GIF)'
    ),
  isPrimary: z.boolean().optional(),
});

/**
 * Product search schema (for debounced search)
 */
export const productSearchSchema = z.object({
  q: z
    .string()
    .min(1, 'Search query is required')
    .max(100, 'Search query must not exceed 100 characters'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional(),
});

/**
 * Product list filter schema
 */
export const productFilterSchema = z.object({
  category: z.string().optional(),
  brand: z.string().optional(),
  active: z.enum(['true', 'false']).optional(),
  discontinued: z.enum(['true', 'false']).optional(),
  search: z.string().max(100).optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  sortBy: z.enum(['name', 'sellingPrice', 'costPrice', 'createdAt', 'updatedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

/**
 * Type inference for form data
 */
export type CreateProductFormData = z.infer<typeof createProductSchema>;
export type UpdateProductFormData = z.infer<typeof updateProductSchema>;
export type ImageUploadFormData = z.infer<typeof imageUploadSchema>;
export type ProductSearchFormData = z.infer<typeof productSearchSchema>;
export type ProductFilterFormData = z.infer<typeof productFilterSchema>;
