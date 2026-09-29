/**
 * The only product fields the public catalog selects. `createdAt` is selected
 * for sorting and never serialized.
 */
export const PUBLIC_PRODUCT_SELECT =
  'name description brand productModel category motorcycleModels images sellingPrice createdAt';

const primaryImageOf = (images) => {
  if (!Array.isArray(images) || images.length === 0) return null;
  const primary = images.find((image) => image.isPrimary);
  return (primary ?? images[0]).url ?? null;
};

const isPopulated = (value) => value !== null && typeof value === 'object' && 'name' in value;

/**
 * Builds the public view of a lean product document from an explicit
 * allow-list. Anything not named here, cost and margin included, cannot reach
 * a visitor, and a field added to Product later stays private until it is
 * added here.
 *
 * @param {object} doc a `.lean()` product, category and motorcycleModels populated
 * @returns {object} the public product
 */
export const toPublicProduct = (doc) => ({
  _id: String(doc._id),
  name: doc.name,
  description: doc.description ?? '',
  brand: doc.brand ?? '',
  productModel: doc.productModel ?? '',
  category: isPopulated(doc.category)
    ? { _id: String(doc.category._id), name: doc.category.name }
    : null,
  motorcycleModels: (doc.motorcycleModels ?? [])
    .filter((model) => model !== null && typeof model === 'object' && 'make' in model)
    .map((model) => ({
      _id: String(model._id),
      make: model.make,
      model: model.model,
      yearFrom: model.yearFrom ?? null,
      yearTo: model.yearTo ?? null,
    })),
  images: (doc.images ?? []).map((image) => ({ url: image.url, isPrimary: Boolean(image.isPrimary) })),
  primaryImage: primaryImageOf(doc.images),
  sellingPrice: doc.sellingPrice,
});

/**
 * The public stock label for one branch's stock row. Reads available stock,
 * `quantity - reservedQuantity`, because units held for pending orders cannot
 * be sold to a walk-in; Stock's own `stockStatus` virtual ignores reservations.
 *
 * @param {{ quantity?: number, reservedQuantity?: number, reorderPoint?: number }} stock
 * @returns {'in-stock'|'low-stock'|'out-of-stock'}
 */
export const publicStockStatus = (stock) => {
  const available = Math.max(0, (stock.quantity ?? 0) - (stock.reservedQuantity ?? 0));
  if (available === 0) return 'out-of-stock';
  if (available <= (stock.reorderPoint ?? 0)) return 'low-stock';
  return 'in-stock';
};
