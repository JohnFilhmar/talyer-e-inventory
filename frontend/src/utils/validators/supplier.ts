import { z } from 'zod';
import { PAYMENT_TERMS } from '@/types/supplier';

/**
 * Valid payment terms
 */
const paymentTerms = PAYMENT_TERMS.map((t) => t.value) as [string, ...string[]];

/**
 * Contact schema (nested)
 */
const contactSchema = z.object({
  personName: z.string().max(100, 'Contact person must not exceed 100 characters').optional().or(z.literal('')),
  phone: z.string().max(20, 'Phone must not exceed 20 characters').optional().or(z.literal('')),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
}).optional();

/**
 * Address schema (nested)
 */
const addressSchema = z.object({
  street: z.string().max(200, 'Street must not exceed 200 characters').optional().or(z.literal('')),
  city: z.string().max(100, 'City must not exceed 100 characters').optional().or(z.literal('')),
  province: z.string().max(100, 'Province must not exceed 100 characters').optional().or(z.literal('')),
  postalCode: z.string().max(10, 'Postal code must not exceed 10 characters').optional().or(z.literal('')),
  country: z.string().max(100, 'Country must not exceed 100 characters').optional().or(z.literal('')),
}).optional();

/**
 * Create supplier form schema
 * Matches backend Supplier model with nested contact and address
 */
export const createSupplierSchema = z.object({
  name: z
    .string()
    .min(1, 'Supplier name is required')
    .min(2, 'Supplier name must be at least 2 characters')
    .max(200, 'Supplier name must not exceed 200 characters'),
  contact: contactSchema,
  address: addressSchema,
  paymentTerms: z
    .enum(paymentTerms)
    .optional()
    .or(z.literal('')),
  creditLimit: z
    .number({ message: 'Credit limit must be a valid number' })
    .min(0, 'Credit limit cannot be negative')
    .optional(),
  notes: z
    .string()
    .max(1000, 'Notes must not exceed 1000 characters')
    .optional()
    .or(z.literal('')),
});

export type CreateSupplierFormData = z.infer<typeof createSupplierSchema>;

/**
 * Update supplier form schema (same as create, all fields optional in logic)
 */
export const updateSupplierSchema = createSupplierSchema.partial().extend({
  name: z
    .string()
    .min(2, 'Supplier name must be at least 2 characters')
    .max(200, 'Supplier name must not exceed 200 characters')
    .optional(),
});

export type UpdateSupplierFormData = z.infer<typeof updateSupplierSchema>;

/**
 * Helper to clean empty strings to undefined for API submission
 */
export function cleanSupplierPayload<T extends Record<string, unknown>>(data: T): T {
  const cleaned = { ...data };
  
  for (const key of Object.keys(cleaned)) {
    if (cleaned[key] === '') {
      delete cleaned[key];
    }
  }
  
  return cleaned;
}
