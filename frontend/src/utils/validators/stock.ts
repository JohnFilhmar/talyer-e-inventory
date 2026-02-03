import { z } from 'zod';
import { ADJUSTMENT_REASONS, TRANSFER_STATUS_OPTIONS } from '@/types/stock';

/**
 * Valid adjustment reasons
 */
const adjustmentReasons = ADJUSTMENT_REASONS.map((r) => r.value) as [string, ...string[]];

/**
 * Valid transfer statuses
 */
const transferStatuses = TRANSFER_STATUS_OPTIONS.map((s) => s.value) as [string, ...string[]];

/**
 * Simple restock form schema (for modal use)
 * Used when restocking an existing stock record
 * Note: No cost price - we just add quantity to existing stock
 */
export const restockSchema = z.object({
  quantity: z
    .number({ message: 'Quantity must be a valid number' })
    .int('Quantity must be a whole number')
    .positive('Quantity must be greater than 0'),
  supplierId: z.string().optional().or(z.literal('')),
  notes: z
    .string()
    .max(500, 'Notes must not exceed 500 characters')
    .optional()
    .or(z.literal('')),
});

export type RestockFormData = z.infer<typeof restockSchema>;

/**
 * Full stock creation schema (for creating new stock records)
 */
export const createStockSchema = z.object({
  product: z.string().min(1, 'Product is required'),
  branch: z.string().min(1, 'Branch is required'),
  quantity: z
    .number({ message: 'Quantity must be a valid number' })
    .int('Quantity must be a whole number')
    .positive('Quantity must be greater than 0'),
  costPrice: z
    .number({ message: 'Cost price must be a valid number' })
    .min(0, 'Cost price cannot be negative'),
  sellingPrice: z
    .number({ message: 'Selling price must be a valid number' })
    .min(0, 'Selling price cannot be negative'),
  reorderPoint: z
    .number({ message: 'Reorder point must be a valid number' })
    .int('Reorder point must be a whole number')
    .min(0, 'Reorder point cannot be negative')
    .optional(),
  reorderQuantity: z
    .number({ message: 'Reorder quantity must be a valid number' })
    .int('Reorder quantity must be a whole number')
    .positive('Reorder quantity must be greater than 0')
    .optional(),
  supplier: z.string().optional().or(z.literal('')),
  location: z
    .string()
    .max(100, 'Location must not exceed 100 characters')
    .optional()
    .or(z.literal('')),
}).refine((data) => data.sellingPrice >= data.costPrice, {
  message: 'Selling price must be greater than or equal to cost price',
  path: ['sellingPrice'],
});

export type CreateStockFormData = z.infer<typeof createStockSchema>;

/**
 * Adjust stock form schema (for modal use)
 * Used when adjusting an existing stock record
 */
export const adjustStockSchema = z.object({
  quantity: z
    .number({ message: 'Quantity must be a valid number' })
    .int('Quantity must be a whole number')
    .refine((val) => val !== 0, 'Adjustment cannot be zero'),
  reason: z.enum(adjustmentReasons, { message: 'Please select a valid reason' }),
  notes: z
    .string()
    .max(500, 'Notes must not exceed 500 characters')
    .optional()
    .or(z.literal('')),
});

export type AdjustStockFormData = z.infer<typeof adjustStockSchema>;

/**
 * Create transfer form schema
 */
export const createTransferSchema = z.object({
  product: z.string().min(1, 'Product is required'),
  fromBranch: z.string().min(1, 'Source branch is required'),
  toBranch: z.string().min(1, 'Destination branch is required'),
  quantity: z
    .number({ message: 'Quantity must be a valid number' })
    .int('Quantity must be a whole number')
    .positive('Quantity must be greater than 0'),
  notes: z
    .string()
    .max(500, 'Notes must not exceed 500 characters')
    .optional()
    .or(z.literal('')),
}).refine((data) => data.fromBranch !== data.toBranch, {
  message: 'Source and destination branches must be different',
  path: ['toBranch'],
});

export type CreateTransferFormData = z.infer<typeof createTransferSchema>;

/**
 * Update transfer status schema
 */
export const updateTransferStatusSchema = z.object({
  status: z.enum(transferStatuses as [string, ...string[]], { message: 'Please select a valid status' }),
});

export type UpdateTransferStatusFormData = z.infer<typeof updateTransferStatusSchema>;

/**
 * Helper to validate adjustment won't result in negative stock
 * @param currentQuantity - Current stock quantity
 * @param adjustment - Adjustment amount (can be negative)
 */
export function validateAdjustment(currentQuantity: number, adjustment: number): string | null {
  const newQuantity = currentQuantity + adjustment;
  if (newQuantity < 0) {
    return `Adjustment would result in negative stock (${newQuantity}). Maximum reduction is ${currentQuantity}.`;
  }
  return null;
}

/**
 * Helper to validate transfer quantity against available stock
 * @param availableQuantity - Available stock (quantity - reserved)
 * @param transferQuantity - Requested transfer quantity
 */
export function validateTransferQuantity(availableQuantity: number, transferQuantity: number): string | null {
  if (transferQuantity > availableQuantity) {
    return `Transfer quantity (${transferQuantity}) exceeds available stock (${availableQuantity}).`;
  }
  return null;
}
