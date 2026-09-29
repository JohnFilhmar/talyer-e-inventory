import Product from '../models/Product.js';
import Stock from '../models/Stock.js';
import Category from '../models/Category.js';
import MotorcycleModel from '../models/MotorcycleModel.js';
// Registered for the branch populate below; nothing else here uses it.
import '../models/Branch.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/apiResponse.js';
import CacheUtil from '../utils/cache.js';
import { asObjectId, asEnum, asCount } from '../utils/narrowing.js';
import { parseMotorcycleModelFilter, productTextClauses } from '../utils/productSearch.js';
import { PUBLIC_PRODUCT_SELECT, toPublicProduct, publicStockStatus } from '../utils/publicProduct.js';

/** Sort orders the public listing accepts. */
export const PUBLIC_SORTS = ['newest', 'name', 'price_asc', 'price_desc'];

const SORT_SPEC = {
  newest: { createdAt: -1 },
  name: { name: 1 },
  price_asc: { sellingPrice: 1 },
  price_desc: { sellingPrice: -1 },
};

/** Largest page the public listing serves. */
export const PUBLIC_MAX_LIMIT = 48;
const PUBLIC_DEFAULT_LIMIT = 24;
const PUBLIC_TTL_SECONDS = 60;
const MAX_SEARCH_LENGTH = 100;
const MOTORCYCLE_SELECT = 'make model yearFrom yearTo';
const LISTED = { isActive: true, isDiscontinued: { $ne: true } };

/**
 * How many active branches hold available stock of each product, in one
 * aggregate rather than a query per card.
 *
 * @param {import('mongoose').Types.ObjectId[]} productIds
 * @returns {Promise<Map<string, number>>}
 */
const countAvailableBranches = async (productIds) => {
  if (productIds.length === 0) return new Map();
  const rows = await Stock.aggregate([
    { $match: { product: { $in: productIds } } },
    { $match: { $expr: { $gt: [{ $subtract: ['$quantity', '$reservedQuantity'] }, 0] } } },
    { $lookup: { from: 'branches', localField: 'branch', foreignField: '_id', as: 'branchDoc' } },
    { $match: { 'branchDoc.isActive': true } },
    { $group: { _id: '$product', branches: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.branches]));
};

/**
 * @desc    Public product listing
 * @route   GET /api/public/products
 * @access  Public
 */
export const getPublicProducts = asyncHandler(async (req, res) => {
  const page = Math.max(1, asCount(req.query.page, 1));
  const limit = Math.min(Math.max(1, asCount(req.query.limit, PUBLIC_DEFAULT_LIMIT)), PUBLIC_MAX_LIMIT);
  const sort = asEnum(req.query.sort, PUBLIC_SORTS) ?? 'newest';
  const search = typeof req.query.search === 'string'
    ? req.query.search.trim().slice(0, MAX_SEARCH_LENGTH)
    : '';

  let category = null;
  if (req.query.category !== undefined && req.query.category !== '') {
    category = asObjectId(req.query.category);
    if (!category) return ApiResponse.error(res, 400, 'Invalid category');
  }
  const motorcycleModelIds = parseMotorcycleModelFilter(req.query.motorcycleModel);

  const cacheKey = CacheUtil.generateKey(
    'public', 'products', page, limit, sort,
    search || '-', category ?? '-', motorcycleModelIds.join(',') || '-'
  );
  const cached = await CacheUtil.get(cacheKey);
  if (cached) {
    return ApiResponse.paginate(res, cached.data, page, limit, cached.total, 'Catalog retrieved');
  }

  const query = { ...LISTED };
  if (category) query.category = category;
  if (motorcycleModelIds.length > 0) query.motorcycleModels = { $in: motorcycleModelIds };
  if (search) query.$or = await productTextClauses(search);

  const docs = await Product.find(query)
    .select(PUBLIC_PRODUCT_SELECT)
    .populate('category', 'name')
    .populate('motorcycleModels', MOTORCYCLE_SELECT)
    .sort({ ...SORT_SPEC[sort], _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  const total = await Product.countDocuments(query);
  const available = await countAvailableBranches(docs.map((doc) => doc._id));
  const data = docs.map((doc) => ({
    ...toPublicProduct(doc),
    availableAt: available.get(String(doc._id)) ?? 0,
  }));

  await CacheUtil.set(cacheKey, { data, total }, PUBLIC_TTL_SECONDS);
  return ApiResponse.paginate(res, data, page, limit, total, 'Catalog retrieved');
});

/**
 * @desc    Public product detail with per-branch availability
 * @route   GET /api/public/products/:id
 * @access  Public
 */
export const getPublicProduct = asyncHandler(async (req, res) => {
  const id = asObjectId(req.params.id);
  if (!id) return ApiResponse.error(res, 404, 'Product not found');

  const cacheKey = CacheUtil.generateKey('public', 'product', id);
  const cached = await CacheUtil.get(cacheKey);
  if (cached) return ApiResponse.success(res, 200, 'Product retrieved', cached);

  const doc = await Product.findOne({ _id: id, ...LISTED })
    .select(PUBLIC_PRODUCT_SELECT)
    .populate('category', 'name')
    .populate('motorcycleModels', MOTORCYCLE_SELECT)
    .lean();
  if (!doc) return ApiResponse.error(res, 404, 'Product not found');

  const stocks = await Stock.find({ product: doc._id })
    .select('branch quantity reservedQuantity reorderPoint')
    .populate('branch', 'name address.city contact.phone isActive')
    .lean();
  const branches = stocks
    .filter((stock) => stock.branch && stock.branch.isActive !== false)
    .map((stock) => ({
      _id: String(stock.branch._id),
      name: stock.branch.name,
      city: stock.branch.address?.city ?? '',
      phone: stock.branch.contact?.phone ?? '',
      status: publicStockStatus(stock),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const product = {
    ...toPublicProduct(doc),
    availableAt: branches.filter((branch) => branch.status !== 'out-of-stock').length,
    branches,
  };
  await CacheUtil.set(cacheKey, product, PUBLIC_TTL_SECONDS);
  return ApiResponse.success(res, 200, 'Product retrieved', product);
});

/**
 * @desc    Active categories for the catalog filter
 * @route   GET /api/public/categories
 * @access  Public
 */
export const getPublicCategories = asyncHandler(async (req, res) => {
  const cacheKey = CacheUtil.generateKey('public', 'categories');
  const cached = await CacheUtil.get(cacheKey);
  if (cached) return ApiResponse.success(res, 200, 'Categories retrieved', cached);

  const rows = await Category.find({ isActive: true }).select('name').sort({ name: 1 }).lean();
  const data = rows.map((row) => ({ _id: String(row._id), name: row.name }));
  await CacheUtil.set(cacheKey, data, PUBLIC_TTL_SECONDS);
  return ApiResponse.success(res, 200, 'Categories retrieved', data);
});

/**
 * @desc    Motorcycle models for the fitment filter
 * @route   GET /api/public/motorcycle-models
 * @access  Public
 */
export const getPublicMotorcycleModels = asyncHandler(async (req, res) => {
  const cacheKey = CacheUtil.generateKey('public', 'motorcycle-models');
  const cached = await CacheUtil.get(cacheKey);
  if (cached) return ApiResponse.success(res, 200, 'Motorcycle models retrieved', cached);

  const rows = await MotorcycleModel.find()
    .select(MOTORCYCLE_SELECT)
    .sort({ make: 1, model: 1, yearFrom: 1 })
    .lean();
  const data = rows.map((row) => ({
    _id: String(row._id),
    make: row.make,
    model: row.model,
    yearFrom: row.yearFrom ?? null,
    yearTo: row.yearTo ?? null,
  }));
  await CacheUtil.set(cacheKey, data, PUBLIC_TTL_SECONDS);
  return ApiResponse.success(res, 200, 'Motorcycle models retrieved', data);
});
