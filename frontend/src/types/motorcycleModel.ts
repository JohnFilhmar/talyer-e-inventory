/**
 * Motorcycle model types
 * Matches backend MotorcycleModel model schema
 */

/**
 * A motorcycle a product can fit.
 *
 * Deliberately flat, unlike Category: the shop asks "does this fit a Click
 * 125i?", never "what is the parent of a Click 125i?".
 */
export interface MotorcycleModel {
  _id: string;
  make: string;
  model: string;
  /** Optional year range. Both ends absent means "all years". */
  yearFrom?: number;
  yearTo?: number;
  /** Derived from make/model/years; unique, and what blocks duplicate entries. */
  code: string;
  description?: string;
  isActive: boolean;
  /** Virtual field - server-composed label, e.g. "Honda Click 125i (2018-2023)" */
  displayName: string;
  /** Virtual field - populated on list/detail reads */
  productCount?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * The shape a product read embeds for each motorcycle it fits. A subset of the
 * full record — enough to render a chip, no more.
 *
 * `displayName` is a Mongoose virtual and rides along on populated documents,
 * but it is optional here because a client that constructed the reference
 * itself (an optimistic update, a cached row from an older schema) may not
 * have it. Render it through `motorcycleModelLabel` rather than reading the
 * field directly.
 */
export interface ProductMotorcycleModel {
  _id: string;
  make: string;
  model: string;
  yearFrom?: number;
  yearTo?: number;
  code?: string;
  displayName?: string;
}

/**
 * Payload for creating a motorcycle model
 */
export interface CreateMotorcycleModelPayload {
  make: string;
  model: string;
  yearFrom?: number;
  yearTo?: number;
  description?: string;
}

/**
 * Payload for updating a motorcycle model
 */
export interface UpdateMotorcycleModelPayload {
  make?: string;
  model?: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  description?: string;
  isActive?: boolean;
}

/**
 * Query parameters for the motorcycle model list endpoint
 */
export interface MotorcycleModelListParams {
  make?: string;
  active?: string;
  search?: string;
}

/**
 * Label for a motorcycle model, from either the full record or the trimmed
 * reference a product carries.
 *
 * Falls back to composing the label client-side when `displayName` is absent,
 * so a chip never renders blank. The composition rule is kept in step with the
 * `displayName` virtual in backend/src/models/MotorcycleModel.js.
 */
export function motorcycleModelLabel(
  motorcycleModel: MotorcycleModel | ProductMotorcycleModel | undefined | null
): string {
  if (!motorcycleModel) return '';
  if (motorcycleModel.displayName) return motorcycleModel.displayName;

  const base = [motorcycleModel.make, motorcycleModel.model].filter(Boolean).join(' ');
  const { yearFrom, yearTo } = motorcycleModel;

  if (yearFrom && yearTo) {
    return yearFrom === yearTo ? `${base} (${yearFrom})` : `${base} (${yearFrom}-${yearTo})`;
  }
  if (yearFrom) return `${base} (${yearFrom}+)`;
  if (yearTo) return `${base} (up to ${yearTo})`;

  return base;
}

/**
 * Type guard for a populated motorcycle model reference on a product.
 * An unpopulated reference is a bare id string.
 */
export function isPopulatedMotorcycleModel(
  value: ProductMotorcycleModel | string | undefined
): value is ProductMotorcycleModel {
  return value !== undefined && typeof value === 'object' && '_id' in value;
}

/**
 * The id of a motorcycle model reference, populated or not.
 */
export function motorcycleModelId(value: ProductMotorcycleModel | string): string {
  return typeof value === 'string' ? value : value._id;
}
