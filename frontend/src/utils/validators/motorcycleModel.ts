import { z } from 'zod';

/**
 * A model year the shop could plausibly be working on. The upper bound is
 * generous rather than "this year" — dealers list next-year models early — but
 * it still catches a fat-fingered 20222, which would otherwise sort ahead of
 * every real entry in the picker.
 */
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

const yearField = z
  .number()
  .int('Year must be a whole number')
  .min(MIN_YEAR, `Year cannot be earlier than ${MIN_YEAR}`)
  .max(MAX_YEAR, `Year cannot be later than ${MAX_YEAR}`)
  .optional();

/**
 * A range that runs backwards is always a mistake, but only checkable once
 * both ends are present — hence a refinement on the object rather than on
 * either field.
 */
const yearRangeIsOrdered = (data: { yearFrom?: number; yearTo?: number }) => {
  if (data.yearFrom === undefined || data.yearTo === undefined) return true;
  return data.yearTo >= data.yearFrom;
};

const yearRangeError = {
  message: 'Year to must be greater than or equal to year from',
  path: ['yearTo'],
};

/**
 * Create motorcycle model form schema
 */
export const createMotorcycleModelSchema = z
  .object({
    make: z
      .string()
      .min(1, 'Make is required')
      .max(100, 'Make must not exceed 100 characters'),
    model: z
      .string()
      .min(1, 'Model is required')
      .max(100, 'Model must not exceed 100 characters'),
    yearFrom: yearField,
    yearTo: yearField,
    description: z
      .string()
      .max(500, 'Description must not exceed 500 characters')
      .optional()
      .or(z.literal('')),
  })
  .refine(yearRangeIsOrdered, yearRangeError);

/**
 * Update motorcycle model form schema (all fields optional)
 */
export const updateMotorcycleModelSchema = z
  .object({
    make: z
      .string()
      .min(1, 'Make is required')
      .max(100, 'Make must not exceed 100 characters')
      .optional(),
    model: z
      .string()
      .min(1, 'Model is required')
      .max(100, 'Model must not exceed 100 characters')
      .optional(),
    yearFrom: yearField,
    yearTo: yearField,
    description: z
      .string()
      .max(500, 'Description must not exceed 500 characters')
      .optional()
      .or(z.literal('')),
    isActive: z.boolean().optional(),
  })
  .refine(yearRangeIsOrdered, yearRangeError);

/**
 * Type inference for form data
 */
export type CreateMotorcycleModelFormData = z.infer<typeof createMotorcycleModelSchema>;
export type UpdateMotorcycleModelFormData = z.infer<typeof updateMotorcycleModelSchema>;
