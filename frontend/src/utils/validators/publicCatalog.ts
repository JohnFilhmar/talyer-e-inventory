import { z } from 'zod';

/** Stock label for one branch, as the public API sends it. */
export const publicStockStatusSchema = z.enum(['in-stock', 'low-stock', 'out-of-stock']);

/** A category as the public catalog exposes it. */
export const publicCategorySchema = z.object({ _id: z.string(), name: z.string() });

/** A motorcycle model as the public catalog exposes it. */
export const publicMotorcycleModelSchema = z.object({
  _id: z.string(),
  make: z.string(),
  model: z.string(),
  yearFrom: z.number().nullable(),
  yearTo: z.number().nullable(),
});

/** A product card in the public listing. */
export const publicProductSchema = z.object({
  _id: z.string(),
  name: z.string(),
  description: z.string(),
  brand: z.string(),
  productModel: z.string(),
  category: publicCategorySchema.nullable(),
  motorcycleModels: z.array(publicMotorcycleModelSchema),
  images: z.array(z.object({ url: z.string(), isPrimary: z.boolean() })),
  primaryImage: z.string().nullable(),
  sellingPrice: z.number(),
  availableAt: z.number().int().nonnegative(),
});

/** One branch's availability on the product page. */
export const publicBranchAvailabilitySchema = z.object({
  _id: z.string(),
  name: z.string(),
  city: z.string(),
  phone: z.string(),
  status: publicStockStatusSchema,
});

/** The product page: a card plus where it is stocked. */
export const publicProductDetailSchema = publicProductSchema.extend({
  branches: z.array(publicBranchAvailabilitySchema),
});

/** One page of the listing. */
export const publicProductPageSchema = z.object({
  data: z.array(publicProductSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    pages: z.number(),
  }),
});

export type PublicStockStatus = z.infer<typeof publicStockStatusSchema>;
export type PublicCategory = z.infer<typeof publicCategorySchema>;
export type PublicMotorcycleModel = z.infer<typeof publicMotorcycleModelSchema>;
export type PublicProduct = z.infer<typeof publicProductSchema>;
export type PublicBranchAvailability = z.infer<typeof publicBranchAvailabilitySchema>;
export type PublicProductDetail = z.infer<typeof publicProductDetailSchema>;
export type PublicProductPage = z.infer<typeof publicProductPageSchema>;
