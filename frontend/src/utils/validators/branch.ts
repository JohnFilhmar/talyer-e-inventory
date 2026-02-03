import { z } from 'zod';

/**
 * Phone number validation regex
 * Allows digits, spaces, hyphens, plus sign, and parentheses
 * Example: +63 2 1234 5678, (02) 1234-5678
 */
const phoneRegex = /^[\d\s\-+()]+$/;

/**
 * Branch code validation regex
 * Uppercase alphanumeric with hyphens allowed
 * Example: MAIN-001, BR-MANILA
 */
const codeRegex = /^[A-Z0-9-]+$/;

/**
 * Branch address schema
 */
export const branchAddressSchema = z.object({
  street: z
    .string()
    .min(1, 'Street address is required')
    .min(5, 'Street address must be at least 5 characters')
    .max(200, 'Street address must not exceed 200 characters'),
  city: z
    .string()
    .min(1, 'City is required')
    .min(2, 'City must be at least 2 characters')
    .max(100, 'City must not exceed 100 characters'),
  province: z
    .string()
    .min(1, 'Province is required')
    .min(2, 'Province must be at least 2 characters')
    .max(100, 'Province must not exceed 100 characters'),
  postalCode: z
    .string()
    .max(20, 'Postal code must not exceed 20 characters')
    .optional()
    .or(z.literal('')),
});

/**
 * Branch contact schema
 */
export const branchContactSchema = z.object({
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .regex(phoneRegex, 'Invalid phone number format'),
  email: z
    .string()
    .email('Invalid email address')
    .optional()
    .or(z.literal('')),
});

/**
 * Branch settings schema
 */
export const branchSettingsSchema = z.object({
  taxRate: z
    .number()
    .min(0, 'Tax rate cannot be negative')
    .max(100, 'Tax rate cannot exceed 100%')
    .optional(),
  currency: z.enum(['PHP', 'USD', 'EUR']).optional(),
  timezone: z.string().optional(),
  allowNegativeStock: z.boolean().optional(),
  lowStockThreshold: z.number().min(0).optional(),
});

/**
 * Create branch form schema
 */
export const createBranchSchema = z.object({
  name: z
    .string()
    .min(1, 'Branch name is required')
    .min(2, 'Branch name must be at least 2 characters')
    .max(100, 'Branch name must not exceed 100 characters'),
  code: z
    .string()
    .min(1, 'Branch code is required')
    .min(2, 'Branch code must be at least 2 characters')
    .max(20, 'Branch code must not exceed 20 characters')
    .regex(codeRegex, 'Branch code must be uppercase alphanumeric (hyphens allowed)')
    .transform((val) => val.toUpperCase()),
  address: branchAddressSchema,
  contact: branchContactSchema,
  manager: z.string().optional().or(z.literal('')),
  settings: branchSettingsSchema.optional(),
  description: z
    .string()
    .max(500, 'Description must not exceed 500 characters')
    .optional()
    .or(z.literal('')),
});

/**
 * Update branch form schema (all fields optional)
 */
export const updateBranchSchema = z.object({
  name: z
    .string()
    .min(2, 'Branch name must be at least 2 characters')
    .max(100, 'Branch name must not exceed 100 characters')
    .optional(),
  code: z
    .string()
    .min(2, 'Branch code must be at least 2 characters')
    .max(20, 'Branch code must not exceed 20 characters')
    .regex(codeRegex, 'Branch code must be uppercase alphanumeric (hyphens allowed)')
    .transform((val) => val.toUpperCase())
    .optional(),
  address: branchAddressSchema.partial().optional(),
  contact: branchContactSchema.partial().optional(),
  manager: z.string().optional().nullable(),
  settings: branchSettingsSchema.optional(),
  isActive: z.boolean().optional(),
  description: z
    .string()
    .max(500, 'Description must not exceed 500 characters')
    .optional()
    .or(z.literal('')),
});

/**
 * Type inference for form data
 */
export type CreateBranchFormData = z.infer<typeof createBranchSchema>;
export type UpdateBranchFormData = z.infer<typeof updateBranchSchema>;
