import { z } from 'zod';
import {
  SERVICE_STATUS,
  SERVICE_PRIORITY,
  PAYMENT_METHODS,
  normalizePhoneNumber,
} from '@/types/service';

/**
 * Valid service statuses
 */
const serviceStatuses = Object.values(SERVICE_STATUS) as [string, ...string[]];

/**
 * Valid service priorities
 */
const servicePriorities = Object.values(SERVICE_PRIORITY) as [string, ...string[]];

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
    z
      .string()
      .regex(/^9\d{9}$/, 'Phone must be 10 digits starting with 9 (e.g., 9171234567)')
      .transform((val) => normalizePhoneNumber(val))
      .optional()
  );

/**
 * Customer information schema for services
 */
export const serviceCustomerSchema = z.object({
  name: z
    .string()
    .min(1, 'Customer name is required')
    .min(2, 'Customer name must be at least 2 characters')
    .max(100, 'Customer name must not exceed 100 characters'),
  phone: phoneSchema,
  email: z
    .string()
    .email('Invalid email address')
    .optional()
    .or(z.literal('')),
  address: z
    .string()
    .max(200, 'Address must not exceed 200 characters')
    .optional()
    .or(z.literal('')),
});

export type ServiceCustomerFormData = z.infer<typeof serviceCustomerSchema>;

/**
 * Vehicle information schema
 */
export const vehicleSchema = z.object({
  make: z
    .string()
    .max(50, 'Make must not exceed 50 characters')
    .optional()
    .or(z.literal('')),
  model: z
    .string()
    .max(50, 'Model must not exceed 50 characters')
    .optional()
    .or(z.literal('')),
  year: z
    .number({ message: 'Year must be a valid number' })
    .int('Year must be a whole number')
    .min(1900, 'Year must be 1900 or later')
    .max(new Date().getFullYear() + 2, 'Year cannot be too far in the future')
    .optional()
    .nullable(),
  plateNumber: z
    .string()
    .max(20, 'Plate number must not exceed 20 characters')
    .optional()
    .or(z.literal('')),
  vin: z
    .string()
    .max(17, 'VIN must not exceed 17 characters')
    .optional()
    .or(z.literal('')),
  mileage: z
    .number({ message: 'Mileage must be a valid number' })
    .int('Mileage must be a whole number')
    .min(0, 'Mileage cannot be negative')
    .optional()
    .nullable(),
});

export type VehicleFormData = z.infer<typeof vehicleSchema>;

/**
 * Part used in service schema
 */
export const partUsedSchema = z.object({
  product: z.string().min(1, 'Product is required'),
  quantity: z
    .number({ message: 'Quantity must be a valid number' })
    .int('Quantity must be a whole number')
    .positive('Quantity must be at least 1'),
});

export type PartUsedFormData = z.infer<typeof partUsedSchema>;

/**
 * Create service order schema
 */
export const createServiceOrderSchema = z.object({
  branch: z.string().min(1, 'Branch is required'),
  customer: serviceCustomerSchema,
  vehicle: vehicleSchema,
  assignedTo: z.string().optional().or(z.literal('')),
  description: z
    .string()
    .min(1, 'Service description is required')
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description must not exceed 2000 characters'),
  diagnosis: z
    .string()
    .max(2000, 'Diagnosis must not exceed 2000 characters')
    .optional()
    .or(z.literal('')),
  laborCost: z
    .number({ message: 'Labor cost must be a valid number' })
    .min(0, 'Labor cost cannot be negative')
    .optional()
    .default(0),
  otherCharges: z
    .number({ message: 'Other charges must be a valid number' })
    .min(0, 'Other charges cannot be negative')
    .optional()
    .default(0),
  priority: z.enum(servicePriorities).optional().default('normal'),
  scheduledAt: z.string().optional().or(z.literal('')),
  notes: z
    .string()
    .max(1000, 'Notes must not exceed 1000 characters')
    .optional()
    .or(z.literal('')),
});

export type CreateServiceOrderFormData = z.infer<typeof createServiceOrderSchema>;

/**
 * Assign mechanic schema
 */
export const assignMechanicSchema = z.object({
  mechanicId: z.string().min(1, 'Please select a mechanic'),
});

export type AssignMechanicFormData = z.infer<typeof assignMechanicSchema>;

/**
 * Update service status schema
 */
export const updateServiceStatusSchema = z.object({
  status: z.enum(serviceStatuses, { message: 'Please select a valid status' }),
});

export type UpdateServiceStatusFormData = z.infer<typeof updateServiceStatusSchema>;

/**
 * Update parts schema
 */
export const updatePartsSchema = z.object({
  partsUsed: z.array(partUsedSchema),
});

export type UpdatePartsFormData = z.infer<typeof updatePartsSchema>;

/**
 * Update payment schema for services
 */
export const updateServicePaymentSchema = z.object({
  amountPaid: z
    .number({ message: 'Amount must be a valid number' })
    .min(0, 'Amount cannot be negative'),
  paymentMethod: z
    .enum(paymentMethods, { message: 'Please select a valid payment method' })
    .optional(),
});

export type UpdateServicePaymentFormData = z.infer<typeof updateServicePaymentSchema>;

/**
 * Update charges schema (labor cost, other charges)
 */
export const updateChargesSchema = z.object({
  laborCost: z
    .number({ message: 'Labor cost must be a valid number' })
    .min(0, 'Labor cost cannot be negative')
    .optional(),
  otherCharges: z
    .number({ message: 'Other charges must be a valid number' })
    .min(0, 'Other charges cannot be negative')
    .optional(),
  diagnosis: z
    .string()
    .max(2000, 'Diagnosis must not exceed 2000 characters')
    .optional()
    .or(z.literal('')),
});

export type UpdateChargesFormData = z.infer<typeof updateChargesSchema>;

/**
 * Helper to clean empty strings from form data
 */
export function cleanServiceOrderPayload<T extends Record<string, unknown>>(data: T): T {
  const cleaned = { ...data };

  // Clean customer
  if (cleaned.customer && typeof cleaned.customer === 'object') {
    const customer = cleaned.customer as Record<string, unknown>;
    if (customer.email === '') delete customer.email;
    if (customer.address === '') delete customer.address;
  }

  // Clean vehicle
  if (cleaned.vehicle && typeof cleaned.vehicle === 'object') {
    const vehicle = cleaned.vehicle as Record<string, unknown>;
    if (vehicle.make === '') delete vehicle.make;
    if (vehicle.model === '') delete vehicle.model;
    if (vehicle.plateNumber === '') delete vehicle.plateNumber;
    if (vehicle.vin === '') delete vehicle.vin;
    if (vehicle.year === null || vehicle.year === undefined) delete vehicle.year;
    if (vehicle.mileage === null || vehicle.mileage === undefined) delete vehicle.mileage;
  }

  // Clean other fields
  if (cleaned.assignedTo === '') delete cleaned.assignedTo;
  if (cleaned.diagnosis === '') delete cleaned.diagnosis;
  if (cleaned.scheduledAt === '') delete cleaned.scheduledAt;
  if (cleaned.notes === '') delete cleaned.notes;

  return cleaned;
}
