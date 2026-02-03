import { z } from 'zod';
import {
  ORDER_STATUS,
  PAYMENT_METHODS,
  normalizePhoneNumber,
} from '@/types/sales';

/**
 * Valid order statuses
 */
const orderStatuses = Object.values(ORDER_STATUS) as [string, ...string[]];

/**
 * Valid payment methods
 */
const paymentMethods = Object.values(PAYMENT_METHODS) as [string, ...string[]];

/**
 * Philippine phone number validation
 * Input format: 9XXXXXXXXX (10 digits starting with 9)
 * Stored format: 09XXXXXXXXX (11 digits starting with 09)
 */
export const phoneSchema = z
  .string()
  .regex(/^9\d{9}$/, 'Phone must be 10 digits starting with 9 (e.g., 9171234567)')
  .transform((val) => normalizePhoneNumber(val));

/**
 * Optional phone schema (allows empty string)
 */
export const optionalPhoneSchema = z
  .string()
  .optional()
  .transform((val) => {
    if (!val || val === '') return undefined;
    return val;
  })
  .pipe(
    z.string()
      .regex(/^9\d{9}$/, 'Phone must be 10 digits starting with 9 (e.g., 9171234567)')
      .transform((val) => normalizePhoneNumber(val))
      .optional()
  );

/**
 * Customer information schema
 */
export const customerSchema = z.object({
  name: z
    .string()
    .min(1, 'Customer name is required')
    .min(2, 'Customer name must be at least 2 characters')
    .max(100, 'Customer name must not exceed 100 characters'),
  phone: optionalPhoneSchema,
  email: z
    .string()
    .email('Invalid email address')
    .optional()
    .or(z.literal('')),
  address: z
    .string()
    .max(500, 'Address must not exceed 500 characters')
    .optional()
    .or(z.literal('')),
});

export type CustomerFormData = z.infer<typeof customerSchema>;

/**
 * Order item schema
 */
export const orderItemSchema = z.object({
  product: z.string().min(1, 'Product is required'),
  quantity: z
    .number({ message: 'Quantity must be a valid number' })
    .int('Quantity must be a whole number')
    .positive('Quantity must be at least 1'),
  discount: z
    .number({ message: 'Discount must be a valid number' })
    .min(0, 'Discount cannot be negative')
    .optional()
    .default(0),
});

export type OrderItemFormData = z.infer<typeof orderItemSchema>;

/**
 * Create sales order schema
 */
export const createSalesOrderSchema = z.object({
  branch: z.string().min(1, 'Branch is required'),
  customer: customerSchema,
  items: z
    .array(orderItemSchema)
    .min(1, 'At least one item is required'),
  taxRate: z
    .number({ message: 'Tax rate must be a valid number' })
    .min(0, 'Tax rate cannot be negative')
    .max(100, 'Tax rate cannot exceed 100%')
    .optional()
    .default(0),
  discount: z
    .number({ message: 'Discount must be a valid number' })
    .min(0, 'Discount cannot be negative')
    .optional()
    .default(0),
  paymentMethod: z.enum(paymentMethods, { message: 'Please select a valid payment method' }),
  amountPaid: z
    .number({ message: 'Amount paid must be a valid number' })
    .min(0, 'Amount paid cannot be negative')
    .optional()
    .default(0),
  notes: z
    .string()
    .max(1000, 'Notes must not exceed 1000 characters')
    .optional()
    .or(z.literal('')),
});

export type CreateSalesOrderFormData = z.infer<typeof createSalesOrderSchema>;

/**
 * Update order status schema
 */
export const updateOrderStatusSchema = z.object({
  status: z.enum(orderStatuses, { message: 'Please select a valid status' }),
});

export type UpdateOrderStatusFormData = z.infer<typeof updateOrderStatusSchema>;

/**
 * Update payment schema
 */
export const updatePaymentSchema = z.object({
  amountPaid: z
    .number({ message: 'Amount must be a valid number' })
    .min(0.01, 'Amount must be greater than 0'),
  paymentMethod: z
    .enum(paymentMethods, { message: 'Please select a valid payment method' })
    .optional(),
});

export type UpdatePaymentFormData = z.infer<typeof updatePaymentSchema>;

/**
 * Helper to clean empty strings from form data
 */
export function cleanSalesOrderPayload<T extends Record<string, unknown>>(data: T): T {
  const cleaned = { ...data };

  // Clean top-level empty strings
  for (const key of Object.keys(cleaned)) {
    if (cleaned[key] === '') {
      delete cleaned[key];
    }
  }

  // Clean customer object
  if ('customer' in cleaned && cleaned.customer && typeof cleaned.customer === 'object') {
    const customer = { ...cleaned.customer as Record<string, unknown> };
    for (const key of Object.keys(customer)) {
      if (customer[key] === '') {
        delete customer[key];
      }
    }
    (cleaned as Record<string, unknown>).customer = customer;
  }

  return cleaned;
}

/**
 * Validate quantity against available stock
 * @param quantity - Requested quantity
 * @param available - Available stock quantity
 */
export function validateQuantityAgainstStock(quantity: number, available: number): string | null {
  if (quantity > available) {
    return `Requested quantity (${quantity}) exceeds available stock (${available})`;
  }
  return null;
}
