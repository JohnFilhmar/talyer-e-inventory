import MotorcycleModel from '../models/MotorcycleModel.js';
import { escapeRegex } from './regex.js';

/**
 * Normalises the `motorcycleModel` filter, which arrives either as a repeated
 * query param (`?motorcycleModel=a&motorcycleModel=b`, parsed by Express into
 * an array) or as one comma-joined string, the form the frontend sends, since
 * axios's default array serialisation appends `[]` to the key.
 *
 * @param {string|string[]|undefined} raw
 * @returns {string[]} ids, empty when nothing usable was supplied
 */
export const parseMotorcycleModelFilter = (raw) => {
  if (raw === undefined || raw === null) return [];

  const values = Array.isArray(raw) ? raw : String(raw).split(',');

  return values
    .map((value) => String(value).trim())
    .filter((value) => /^[0-9a-fA-F]{24}$/.test(value));
};

/**
 * The `$or` clauses of the mixed product search: one text matches the part
 * (name, SKU, brand, productModel, barcode) and the motorcycle it fits.
 * Motorcycles are resolved to ids first, since their text lives in another
 * collection and a single query cannot reach it.
 *
 * @param {string} q the search text
 * @returns {Promise<object[]>} clauses for a `$or`
 */
export const productTextClauses = async (q) => {
  const pattern = { $regex: escapeRegex(q), $options: 'i' };

  const matchingMotorcycles = await MotorcycleModel.find({
    $or: [{ make: pattern }, { model: pattern }, { code: pattern }]
  })
    .select('_id')
    .lean();

  const clauses = [
    { name: pattern },
    { sku: pattern },
    { brand: pattern },
    { productModel: pattern },
    { barcode: pattern }
  ];

  if (matchingMotorcycles.length > 0) {
    clauses.push({ motorcycleModels: { $in: matchingMotorcycles.map((m) => m._id) } });
  }

  return clauses;
};
