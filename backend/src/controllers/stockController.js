import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import Stock from '../models/Stock.js';
import Product from '../models/Product.js';
import Branch from '../models/Branch.js';
import StockTransfer from '../models/StockTransfer.js';
import StockMovement from '../models/StockMovement.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/apiResponse.js';
import CacheUtil from '../utils/cache.js';
import { createMovementWithOldQuantity, MOVEMENT_TYPES } from '../utils/stockMovement.js';
import { USER_ROLES, PAGINATION, STOCK_TRANSFER_STATUS } from '../config/constants.js';
import { resolveBranchScope, canAccessBranch } from '../utils/branchScope.js';
import { escapeRegex } from '../utils/regex.js';
import { asObjectId, asDate, asEnum } from '../utils/narrowing.js';

/**
 * Resolve a free-text search to the product ids it matches.
 *
 * `Stock` holds a reference to `Product`, not a copy of its name or SKU, so a
 * text search over stock has to resolve products first and filter by id. This
 * is the same two-step `getBranchStock` already used for its category filter.
 *
 * The search exists because the stock list paginates. Filtering the fetched
 * page in the browser, which is what the page used to do, searches only the
 * rows that happen to be on screen: with 300 SKUs and a 20-row page, a product
 * on page four is unfindable from page one and nothing says so.
 *
 * @param {string} search
 * @returns {Promise<Array<import('mongoose').Types.ObjectId>>}
 */
const productIdsMatchingSearch = async (search) => {
  const pattern = new RegExp(escapeRegex(search), 'i');
  const products = await Product.find({
    $or: [
      { name: pattern },
      { sku: pattern },
      { barcode: pattern },
      { brand: pattern },
      { productModel: pattern },
    ],
  })
    .select('_id')
    .lean();

  return products.map((product) => product._id);
};

/**
 * Narrow `query.product` to the intersection of what is already there and a new
 * id list.
 *
 * Assigning `{ $in: ids }` unconditionally would drop an existing `product`
 * filter, so a search combined with a product filter would silently widen back
 * to the whole search. An empty result must stay empty: the previous category
 * filter skipped itself when it matched nothing, which turned "no products in
 * this category" into "every product in this branch".
 *
 * @param {object} query
 * @param {Array<import('mongoose').Types.ObjectId|string>} ids
 */
const restrictToProducts = (query, ids) => {
  const asStrings = ids.map(String);

  if (!query.product) {
    query.product = { $in: ids };
    return;
  }

  if (query.product.$in) {
    const existing = query.product.$in.map(String);
    const kept = new Set(existing.filter((id) => asStrings.includes(id)));
    query.product = { $in: ids.filter((id) => kept.has(String(id))) };
    return;
  }

  // A single explicit product id: keep it only if it survives the new filter.
  query.product = asStrings.includes(String(query.product))
    ? query.product
    : { $in: [] };
};

/**
 * Rejects bringing more of a product into stock when the product is archived.
 *
 * Deleting a product is a soft delete: `isActive` goes false and
 * `isDiscontinued` true, and the catalog stops listing it. Buying more of
 * something the business has decided to stop carrying is almost always a
 * mistake, and it is one that costs money and shelf space before anyone
 * notices — the product is invisible in the catalog, so the new units are
 * effectively lost until someone audits stock.
 *
 * Reducing stock stays allowed in every case. Dead stock has to be writeable
 * down, sellable off and transferable out, or archiving a product would trap
 * its remaining units with no way to clear them.
 *
 * @param {Object|null} product A Product document (or lean object).
 * @returns {string|null} Reason to refuse, or null when the increase is fine.
 */
const blockedFromIncrease = (product) => {
  if (!product) return null;
  if (product.isActive === false) {
    return `${product.name} is archived. Restore it before adding stock.`;
  }
  if (product.isDiscontinued) {
    return `${product.name} is discontinued. Restore it before adding stock.`;
  }
  return null;
};


/**
 * The fields a stock list may be ordered by.
 *
 * Exported so the route validators check against the same list the controller
 * honours, the way `SALES_SORT_FIELDS` already works.
 */
export const STOCK_SORT_FIELDS = [
  'product.name',
  'branch.name',
  'quantity',
  'available',
  'sellingPrice',
  'createdAt',
];

/**
 * Cast the id fields of a filter for use in an aggregation.
 *
 * `find` casts a filter against the schema, so a 24-character string matches an
 * ObjectId field. An aggregation `$match` does not: the string is compared as a
 * string and matches nothing, silently returning an empty page rather than
 * failing. Only the two fields this controller ever filters by are converted;
 * an `$in` list is already built from real ObjectIds.
 *
 * @param {object} query
 * @returns {object}
 */
const castIds = (query) => {
  const match = { ...query };

  for (const field of ['branch', 'product']) {
    if (typeof match[field] === 'string') {
      match[field] = new mongoose.Types.ObjectId(match[field]);
    }
  }

  return match;
};

/**
 * Return one ordered, paginated page of stock ids.
 *
 * `Stock.find().populate('product').sort({'product.name': 1})` does not work,
 * and had never worked: `populate` is a second query issued after the first has
 * already been sorted and paginated, so that sort key names a path the `Stock`
 * document does not have. The list came back in whatever order the index
 * yielded, which is the worse half of paginating it, because "page 2" has no
 * stable meaning without a total order.
 *
 * Sorting by a populated field needs an aggregation. This one resolves ids
 * only, and the caller then loads those ids through the normal `find` with its
 * populate chain: the New Sale picker and the offline mirror depend on the
 * exact populated shape, including nested fitment, and reproducing that in an
 * aggregation would be a second definition of it to keep in step.
 *
 * `_id` is always the final sort key. Without a tiebreak, two rows with the
 * same name can swap places between requests, which makes a row appear on two
 * pages or on none.
 *
 * @param {object} query the same filter the count uses
 * @param {string} sortBy one of STOCK_SORT_FIELDS
 * @param {1|-1} direction
 * @param {number} skip
 * @param {number} limit
 * @returns {Promise<Array<import('mongoose').Types.ObjectId>>}
 */
const orderedStockIds = async (query, sortBy, direction, skip, limit) => {
  const pipeline = [{ $match: castIds(query) }];

  if (sortBy === 'product.name' || sortBy === 'branch.name') {
    const [ref] = sortBy.split('.');
    const from = ref === 'product' ? Product.collection.name : Branch.collection.name;

    pipeline.push(
      { $lookup: { from, localField: ref, foreignField: '_id', as: '_sortJoin' } },
      { $unwind: { path: '$_sortJoin', preserveNullAndEmptyArrays: true } },
      { $addFields: { _sortKey: '$_sortJoin.name' } }
    );
  } else if (sortBy === 'available') {
    // A virtual on the document, so it does not exist to sort on in the
    // database. Recomputed here from the two fields it is derived from.
    pipeline.push({
      $addFields: { _sortKey: { $subtract: ['$quantity', '$reservedQuantity'] } },
    });
  } else {
    pipeline.push({ $addFields: { _sortKey: `$${sortBy}` } });
  }

  pipeline.push(
    { $sort: { _sortKey: direction, _id: 1 } },
    { $skip: skip },
    { $limit: limit },
    { $project: { _id: 1 } }
  );

  const rows = await Stock.aggregate(pipeline);
  return rows.map((row) => row._id);
};

/**
 * Load stock rows by id, in the order the ids were given.
 *
 * `$in` returns them in whatever order it likes, so the ordering the
 * aggregation just established has to be reapplied after the populate.
 *
 * @param {Array<import('mongoose').Types.ObjectId>} ids
 * @param {(q: import('mongoose').Query) => import('mongoose').Query} withPopulate
 */
const loadInOrder = async (ids, withPopulate) => {
  if (ids.length === 0) return [];

  const records = await withPopulate(Stock.find({ _id: { $in: ids } }));
  const byId = new Map(records.map((record) => [String(record._id), record]));

  return ids.map((id) => byId.get(String(id))).filter(Boolean);
};

/**
 * @desc    Get all stock records with filters
 * @route   GET /api/stock
 * @access  Private (Admin, Salesperson)
 */
export const getAllStock = asyncHandler(async (req, res) => {
  const {
    branch,
    product,
    search,
    lowStock,
    outOfStock,
    page = 1,
    limit = PAGINATION.DEFAULT_LIMIT,
    sortBy = 'product.name',
    sortOrder = 'asc'
  } = req.query;

  const query = {};

  // Non-admins are silently clamped to their own branch: a foreign branch id
  // in the query is ignored rather than rejected, since this is a read.
  const scope = resolveBranchScope(
    req.user,
    req.user.role === USER_ROLES.ADMIN ? branch : undefined
  );
  if (!scope.ok) {
    return ApiResponse.error(res, scope.status, scope.message);
  }
  if (scope.branchId) {
    query.branch = scope.branchId;
  }

  if (product) {
    const productId = asObjectId(product);
    if (!productId) {
      return ApiResponse.error(res, 400, 'Invalid product ID');
    }
    query.product = productId;
  }

  if (search) {
    restrictToProducts(query, await productIdsMatchingSearch(search));
  }

  if (lowStock === 'true') {
    query.$expr = { $lte: ['$quantity', '$reorderPoint'] };
  }
  
  if (outOfStock === 'true') {
    query.quantity = 0;
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const sortField = asEnum(sortBy, STOCK_SORT_FIELDS);
  if (!sortField) {
    return ApiResponse.error(res, 400, 'Invalid sortBy field');
  }
  const direction = sortOrder === 'desc' ? -1 : 1;

  const [orderedIds, total] = await Promise.all([
    orderedStockIds(query, sortField, direction, skip, limitNum),
    Stock.countDocuments(query)
  ]);

  const stockRecords = await loadInOrder(orderedIds, (find) =>
    find
      .populate({
        path: 'product',
        select: 'sku name brand productModel barcode images motorcycleModels isActive isDiscontinued',
        populate: { path: 'motorcycleModels', select: 'make model yearFrom yearTo code' }
      })
      .populate('branch', 'name code')
      .populate('supplier', 'name code')
  );

  return ApiResponse.paginate(
    res,
    stockRecords,
    pageNum,
    limitNum,
    total,
    'Stock records retrieved successfully'
  );
});

/**
 * @desc    Get stock for specific branch
 * @route   GET /api/stock/branch/:branchId
 * @access  Private
 */
export const getBranchStock = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const {
    category,
    search,
    lowStock,
    page = 1,
    limit = 50,
    sortBy = 'product.name',
    sortOrder = 'asc'
  } = req.query;

  // Check if branch exists
  const branch = await Branch.findById(branchId);
  if (!branch) {
    return ApiResponse.error(res, 404, 'Branch not found');
  }

  // Build query
  const query = { branch: branchId };
  
  if (lowStock === 'true') {
    query.$expr = { $lte: ['$quantity', '$reorderPoint'] };
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  // Narrow by category, then by search. Both resolve to product ids because
  // Stock references Product rather than copying its fields.
  //
  // Note the empty case is now honoured. This used to apply the category filter
  // only when it matched at least one product, so a category with nothing in it
  // returned the branch's entire stock list instead of nothing.
  if (category) {
    // Through `asObjectId` rather than straight into the filter. The route's
    // `idRule('category')` already rejects anything else, but CodeQL does not
    // model express-validator chains, so a value that is only guarded by one
    // still reads as user input reaching a query object. The regex test is the
    // shape the analysis follows, and it holds for any caller that arrives
    // without the chain.
    const categoryId = asObjectId(category);
    if (!categoryId) {
      return ApiResponse.error(res, 400, 'Invalid category ID');
    }

    const products = await Product.find({ category: categoryId }).select('_id').lean();
    restrictToProducts(query, products.map((p) => p._id));
  }

  if (search) {
    restrictToProducts(query, await productIdsMatchingSearch(search));
  }

  const sortField = asEnum(sortBy, STOCK_SORT_FIELDS);
  if (!sortField) {
    return ApiResponse.error(res, 400, 'Invalid sortBy field');
  }
  const direction = sortOrder === 'desc' ? -1 : 1;

  const [orderedIds, total] = await Promise.all([
    orderedStockIds(query, sortField, direction, skip, limitNum),
    Stock.countDocuments(query)
  ]);

  const stockRecords = await loadInOrder(orderedIds, (find) =>
    find
      // motorcycleModels is nested-populated here, not just referenced: the New
      // Sale picker searches and filters this list client-side, and offline it
      // reads it back out of the IndexedDB mirror, where an unpopulated id is
      // just an opaque string with nothing to match against.
      .populate({
        path: 'product',
        select: 'sku name brand productModel barcode category images motorcycleModels isActive isDiscontinued',
        populate: [
          { path: 'category', select: 'name code' },
          { path: 'motorcycleModels', select: 'make model yearFrom yearTo code' }
        ]
      })
      .populate('supplier', 'name code')
  );

  return ApiResponse.paginate(
    res,
    stockRecords,
    pageNum,
    limitNum,
    total,
    `Stock for ${branch.name} retrieved successfully`
  );
});

/**
 * @desc    Get stock for specific product across all branches
 * @route   GET /api/stock/product/:productId
 * @access  Private
 */
export const getProductStock = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const product = await Product.findById(productId);
  if (!product) {
    return ApiResponse.error(res, 404, 'Product not found');
  }

  const stockRecords = await Stock.find({ product: productId })
    .populate('branch', 'name code address')
    .sort({ 'branch.name': 1 });

  // Admins see every branch. Everyone else (salespersons, per the route's
  // authorize() gate) is clamped to their own branch, same as getAllStock and
  // getLowStock — otherwise a salesperson at branch A could read branch B's
  // costPrice/sellingPrice and derive its margin. The aggregates below are
  // recomputed from this filtered set so they cannot be diffed against a
  // second call to infer the hidden branches' numbers.
  const visibleRecords = req.user.role === USER_ROLES.ADMIN
    ? stockRecords
    : stockRecords.filter(stock => canAccessBranch(req.user, stock.branch?._id));

  const summary = {
    product: {
      _id: product._id,
      sku: product.sku,
      name: product.name,
      brand: product.brand
    },
    totalQuantity: visibleRecords.reduce((sum, stock) => sum + stock.quantity, 0),
    totalReserved: visibleRecords.reduce((sum, stock) => sum + stock.reservedQuantity, 0),
    totalAvailable: visibleRecords.reduce((sum, stock) => sum + stock.availableQuantity, 0),
    branches: visibleRecords.map(stock => ({
      branch: stock.branch,
      quantity: stock.quantity,
      reservedQuantity: stock.reservedQuantity,
      availableQuantity: stock.availableQuantity,
      costPrice: stock.costPrice,
      sellingPrice: stock.sellingPrice,
      reorderPoint: stock.reorderPoint,
      stockStatus: stock.stockStatus,
      location: stock.location
    }))
  };

  return ApiResponse.success(
    res,
    200,
    'Product stock retrieved successfully',
    summary
  );
});

/**
 * @desc    Get low stock items
 * @route   GET /api/stock/low-stock
 * @access  Private (Admin, Salesperson)
 */
export const getLowStock = asyncHandler(async (req, res) => {
  const { branch, page = 1, limit = PAGINATION.DEFAULT_LIMIT } = req.query;

  const query = {
    $expr: { $lte: ['$quantity', '$reorderPoint'] }
  };

  // Non-admins are silently clamped to their own branch: a foreign branch id
  // in the query is ignored rather than rejected, since this is a read.
  const scope = resolveBranchScope(
    req.user,
    req.user.role === USER_ROLES.ADMIN ? branch : undefined
  );
  if (!scope.ok) {
    return ApiResponse.error(res, scope.status, scope.message);
  }
  if (scope.branchId) {
    query.branch = scope.branchId;
  }

  // Paginated. This endpoint had no skip and no limit at all, so it returned
  // every low-stock row in one response: survivable with a few hundred
  // products, not with a real catalogue, and it is exactly the endpoint a
  // dashboard polls.
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(
    Math.max(1, parseInt(limit, 10) || PAGINATION.DEFAULT_LIMIT),
    PAGINATION.MAX_LIMIT
  );
  const skip = (pageNum - 1) * limitNum;

  const [lowStockItems, total] = await Promise.all([
    Stock.find(query)
      .populate('product', 'sku name brand')
      .populate('branch', 'name code')
      .populate('supplier', 'name code contact')
      .sort({ quantity: 1 })
      .skip(skip)
      .limit(limitNum),
    Stock.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    lowStockItems,
    pageNum,
    limitNum,
    total,
    'Low stock items retrieved successfully'
  );
});

/**
 * @desc    Add or update stock (restock)
 * @route   POST /api/stock/restock
 * @access  Private (Admin, Salesperson)
 */
export const restockProduct = asyncHandler(async (req, res) => {
  const {
    product,
    branch,
    quantity,
    costPrice,
    sellingPrice,
    reorderPoint,
    reorderQuantity,
    supplier,
    location
  } = req.body;

  const scope = resolveBranchScope(req.user, branch);
  if (!scope.ok) {
    return ApiResponse.error(res, scope.status, scope.message);
  }
  const targetBranch = scope.branchId;
  if (!targetBranch) {
    return ApiResponse.error(res, 400, 'Branch is required');
  }

  // Narrowed here, not only in the route chain: these two reach a query
  // directly, and the controller has to be safe on its own terms. See
  // utils/narrowing.js.
  const productId = asObjectId(product);
  const branchId = asObjectId(targetBranch);
  if (!productId || !branchId) {
    return ApiResponse.error(res, 400, 'Invalid product or branch ID');
  }

  // Validate product and branch exist
  const [productExists, branchExists] = await Promise.all([
    Product.findById(productId),
    Branch.findById(branchId)
  ]);

  if (!productExists) {
    return ApiResponse.error(res, 404, 'Product not found');
  }

  if (!branchExists) {
    return ApiResponse.error(res, 404, 'Branch not found');
  }

  const refusal = blockedFromIncrease(productExists);
  if (refusal) {
    return ApiResponse.error(res, 400, refusal);
  }

  // Find existing stock record or create new one
  let stock = await Stock.findOne({ product: productId, branch: branchId });
  const isNewStock = !stock;
  const oldQuantity = stock ? stock.quantity : 0;

  if (stock) {
    // Update existing stock
    stock.quantity += quantity;
    stock.costPrice = costPrice !== undefined ? costPrice : stock.costPrice;
    stock.sellingPrice = sellingPrice !== undefined ? sellingPrice : stock.sellingPrice;
    stock.reorderPoint = reorderPoint !== undefined ? reorderPoint : stock.reorderPoint;
    stock.reorderQuantity = reorderQuantity !== undefined ? reorderQuantity : stock.reorderQuantity;
    stock.supplier = supplier !== undefined ? supplier : stock.supplier;
    stock.location = location !== undefined ? location : stock.location;
    stock.lastRestockedAt = new Date();
    stock.lastRestockedBy = req.user._id;
    
    await stock.save();
  } else {
    // A branch stocking this product for the first time inherits the catalog
    // price. Product prices are the reference — what the manufacturer or
    // supplier lists — and Stock owns what this branch actually charges, which
    // legitimately differs by location.
    //
    // Inheritance happens here and only here. Once a branch has a stock record,
    // later edits to the Product never reach back and overwrite it: a branch
    // manager's deliberate price is not something a catalog update may silently
    // undo. Branches that want the new reference price re-enter it.
    stock = await Stock.create({
      product,
      branch: targetBranch,
      quantity,
      costPrice: costPrice !== undefined ? costPrice : productExists.costPrice,
      sellingPrice: sellingPrice !== undefined ? sellingPrice : productExists.sellingPrice,
      reorderPoint,
      reorderQuantity,
      supplier,
      location,
      lastRestockedAt: new Date(),
      lastRestockedBy: req.user._id
    });
  }

  // Log stock movement
  await createMovementWithOldQuantity(stock, oldQuantity, {
    type: isNewStock ? MOVEMENT_TYPES.INITIAL : MOVEMENT_TYPES.RESTOCK,
    supplier: supplier || undefined,
    notes: isNewStock ? 'Initial stock setup' : undefined,
    performedBy: req.user._id,
  });

  const populatedStock = await Stock.findById(stock._id)
    .populate('product', 'sku name brand')
    .populate('branch', 'name code')
    .populate('supplier', 'name code')
    .populate('lastRestockedBy', 'name');

  // Invalidate cache
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    201,
    'Stock restocked successfully',
    populatedStock
  );
});

/**
 * @desc    Adjust stock quantity (manual correction)
 * @route   POST /api/stock/adjust
 * @access  Private (Admin only)
 */
export const adjustStock = asyncHandler(async (req, res) => {
  const { product, branch, adjustment, reason } = req.body;

  if (!reason) {
    return ApiResponse.error(res, 400, 'Reason for adjustment is required');
  }

  const adjustProductId = asObjectId(product);
  const adjustBranchId = asObjectId(branch);
  if (!adjustProductId || !adjustBranchId) {
    return ApiResponse.error(res, 400, 'Invalid product or branch ID');
  }

  const stock = await Stock.findOne({ product: adjustProductId, branch: adjustBranchId });

  if (!stock) {
    return ApiResponse.error(res, 404, 'Stock record not found');
  }

  // Only upward adjustments are refused. Writing dead stock down must stay
  // possible, or archiving a product would trap its remaining units.
  if (adjustment > 0) {
    const refusal = blockedFromIncrease(await Product.findById(adjustProductId));
    if (refusal) {
      return ApiResponse.error(res, 400, refusal);
    }
  }

  const oldQuantity = stock.quantity;
  // An adjustment must never leave quantity below what is already committed to
  // open orders. Both endpoints clamped at zero and never consulted
  // reservedQuantity, and the `available` virtual is
  // Math.max(0, quantity - reservedQuantity), so a row left at quantity 0 with
  // reservedQuantity 5 simply reads as empty and nothing reconciles the two.
  // Completing that order then calls deductStock(5) against quantity 0, which
  // throws: the order can no longer be completed or cleanly cancelled, and the
  // phantom reservations survive indefinitely.
  //
  // Refused rather than silently released: those reservations belong to real
  // orders, and which one to cancel is a human's decision.
  const targetQuantity = Math.max(0, stock.quantity + adjustment);
  if (targetQuantity < stock.reservedQuantity) {
    return ApiResponse.error(
      res,
      400,
      `Cannot reduce stock to ${targetQuantity}: ${stock.reservedQuantity} unit(s) are reserved by open orders. Cancel or amend those orders first.`
    );
  }

  stock.quantity = targetQuantity;
  await stock.save();

  // Log stock movement
  await createMovementWithOldQuantity(stock, oldQuantity, {
    type: adjustment > 0 ? MOVEMENT_TYPES.ADJUSTMENT_ADD : MOVEMENT_TYPES.ADJUSTMENT_REMOVE,
    reason,
    performedBy: req.user._id,
  });

  const populatedStock = await Stock.findById(stock._id)
    .populate('product', 'sku name brand')
    .populate('branch', 'name code');

  // Invalidate cache
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    200,
    'Stock adjusted successfully',
    {
      stock: populatedStock,
      adjustment: {
        oldQuantity,
        newQuantity: stock.quantity,
        adjustment,
        reason,
        adjustedBy: req.user.name,
        adjustedAt: new Date()
      }
    }
  );
});

/**
 * @desc    Add quantity to existing stock record (simple restock)
 * @route   PUT /api/stock/:id/restock
 * @access  Private (Admin, Salesperson)
 * @note    This does NOT change prices - only adds quantity
 */
export const restockById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity, supplierId, notes } = req.body;

  const stock = await Stock.findById(id);

  if (!stock) {
    return ApiResponse.error(res, 404, 'Stock record not found');
  }

  if (!canAccessBranch(req.user, stock.branch)) {
    return ApiResponse.error(res, 403, 'Access denied to this branch');
  }

  const refusal = blockedFromIncrease(await Product.findById(stock.product));
  if (refusal) {
    return ApiResponse.error(res, 400, refusal);
  }

  const oldQuantity = stock.quantity;

  // Simply add quantity - prices stay the same
  stock.quantity += quantity;
  stock.lastRestockedAt = new Date();
  stock.lastRestockedBy = req.user._id;
  
  // Update supplier if provided
  if (supplierId) {
    stock.supplier = supplierId;
  }

  await stock.save();

  // Log stock movement
  await createMovementWithOldQuantity(stock, oldQuantity, {
    type: MOVEMENT_TYPES.RESTOCK,
    supplier: supplierId || undefined,
    notes: notes || undefined,
    performedBy: req.user._id,
  });

  const populatedStock = await Stock.findById(stock._id)
    .populate('product', 'sku name brand')
    .populate('branch', 'name code')
    .populate('supplier', 'name code')
    .populate('lastRestockedBy', 'name');

  // Invalidate cache
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    200,
    `Added ${quantity} units to stock`,
    populatedStock
  );
});

/**
 * @desc    Adjust stock quantity by ID (manual correction)
 * @route   PUT /api/stock/:id/adjust
 * @access  Private (Admin only)
 */
export const adjustById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity, reason, notes } = req.body;

  const stock = await Stock.findById(id);

  if (!stock) {
    return ApiResponse.error(res, 404, 'Stock record not found');
  }

  // As in adjustStock: refuse increases on an archived product, allow the
  // write-down that clears its remaining units.
  if (quantity > 0) {
    const refusal = blockedFromIncrease(await Product.findById(stock.product));
    if (refusal) {
      return ApiResponse.error(res, 400, refusal);
    }
  }

  const oldQuantity = stock.quantity;
  // An adjustment must never leave quantity below what is already committed to
  // open orders. Both endpoints clamped at zero and never consulted
  // reservedQuantity, and the `available` virtual is
  // Math.max(0, quantity - reservedQuantity), so a row left at quantity 0 with
  // reservedQuantity 5 simply reads as empty and nothing reconciles the two.
  // Completing that order then calls deductStock(5) against quantity 0, which
  // throws: the order can no longer be completed or cleanly cancelled, and the
  // phantom reservations survive indefinitely.
  //
  // Refused rather than silently released: those reservations belong to real
  // orders, and which one to cancel is a human's decision.
  const targetQuantity = Math.max(0, stock.quantity + quantity);
  if (targetQuantity < stock.reservedQuantity) {
    return ApiResponse.error(
      res,
      400,
      `Cannot reduce stock to ${targetQuantity}: ${stock.reservedQuantity} unit(s) are reserved by open orders. Cancel or amend those orders first.`
    );
  }

  stock.quantity = targetQuantity;
  await stock.save();

  // Log stock movement
  await createMovementWithOldQuantity(stock, oldQuantity, {
    type: quantity > 0 ? MOVEMENT_TYPES.ADJUSTMENT_ADD : MOVEMENT_TYPES.ADJUSTMENT_REMOVE,
    reason,
    notes: notes || undefined,
    performedBy: req.user._id,
  });

  const populatedStock = await Stock.findById(stock._id)
    .populate('product', 'sku name brand')
    .populate('branch', 'name code');

  // Invalidate cache
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    200,
    'Stock adjusted successfully',
    {
      stock: populatedStock,
      adjustment: {
        oldQuantity,
        newQuantity: stock.quantity,
        adjustment: quantity,
        reason,
        notes,
        adjustedBy: req.user.name,
        adjustedAt: new Date()
      }
    }
  );
});

/**
 * @desc    Create stock transfer
 * @route   POST /api/stock/transfers
 * @access  Private (Admin, Branch Manager)
 */
export const createStockTransfer = asyncHandler(async (req, res) => {
  const { product, fromBranch, toBranch, quantity, notes } = req.body;

  // Validate branches are different
  if (fromBranch === toBranch) {
    return ApiResponse.error(res, 400, 'Source and destination branches must be different');
  }

  const transferProductId = asObjectId(product);
  const sourceBranchId = asObjectId(fromBranch);
  if (!transferProductId || !sourceBranchId) {
    return ApiResponse.error(res, 400, 'Invalid product or branch ID');
  }

  // Check if source branch has sufficient stock
  const sourceStock = await Stock.findOne({
    product: transferProductId,
    branch: sourceBranchId,
  });

  if (!sourceStock) {
    return ApiResponse.error(res, 404, 'No stock found at source branch');
  }

  if (!sourceStock.hasSufficientStock(quantity)) {
    return ApiResponse.error(
      res,
      400,
      `Insufficient stock available. Available: ${sourceStock.availableQuantity}, Requested: ${quantity}`
    );
  }

  // Reserve, then create. Same compensating-action shape as createSalesOrder:
  // the reservation is a database write, and if the create then fails the units
  // stay reserved forever with nothing to release them. availableQuantity is
  // `quantity - reservedQuantity`, so a leaked reservation makes real stock
  // permanently unsellable and unmovable. Not a transaction; production Mongo is
  // standalone and GAP-046 owns the real fix.
  await sourceStock.reserveStock(quantity);

  let transfer;
  try {
    transfer = await StockTransfer.create({
      product,
      fromBranch,
      toBranch,
      quantity,
      initiatedBy: req.user._id,
      notes
    });
  } catch (error) {
    try {
      await sourceStock.releaseReservedStock(quantity);
    } catch (releaseError) {
      logger.error(
        {
          reqId: req.id,
          stockId: String(sourceStock._id),
          quantity,
          err: { name: releaseError.name, message: releaseError.message },
        },
        'failed to release reserved stock after transfer-creation failure'
      );
    }
    throw error;
  }

  const populatedTransfer = await StockTransfer.findById(transfer._id)
    .populate('product', 'sku name brand')
    .populate('fromBranch', 'name code address')
    .populate('toBranch', 'name code address')
    .populate('initiatedBy', 'name email');

  // TODO: Send notification to destination branch manager (Phase 9)

  // Invalidate cache
  await CacheUtil.delPattern('cache:stock:*');

  return ApiResponse.success(
    res,
    201,
    'Stock transfer created successfully',
    populatedTransfer
  );
});

/**
 * @desc    Update stock transfer status
 * @route   PUT /api/stock/transfers/:id
 * @access  Private (Admin, Branch Manager)
 */
export const updateStockTransferStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const transfer = await StockTransfer.findById(id);

  if (!transfer) {
    return ApiResponse.error(res, 404, 'Stock transfer not found');
  }

  // Validate status transition
  const validTransitions = {
    pending: ['in-transit', 'cancelled'],
    'in-transit': ['completed', 'cancelled'],
    completed: [],
    cancelled: []
  };

  if (!validTransitions[transfer.status].includes(status)) {
    return ApiResponse.error(
      res,
      400,
      `Cannot transition from ${transfer.status} to ${status}`
    );
  }

  const oldStatus = transfer.status;
  transfer.status = status;

  if (status === 'in-transit') {
    transfer.shippedAt = new Date();
    transfer.approvedBy = req.user._id;
  } else if (status === 'completed') {
    transfer.receivedAt = new Date();
    transfer.receivedBy = req.user._id;

    // Resolve the source row before mutating anything.
    //
    // The debit used to sit inside `if (sourceStock)` while the credit below
    // was unconditional, so a transfer whose source row had been deleted either
    // invented inventory outright, when the destination row already existed and
    // was simply incremented, or threw a TypeError dereferencing
    // `sourceStock.costPrice` on the very null the guard had just skipped, after
    // `transfer.status` was already mutated in memory. Twenty units could appear
    // at the destination with a transfer_in movement and no matching
    // transfer_out. Refusing here means the credit is never reached.
    const sourceStock = await Stock.findOne({
      product: transfer.product,
      branch: transfer.fromBranch
    });

    if (!sourceStock) {
      return ApiResponse.error(
        res,
        400,
        `Cannot complete transfer: no stock record for product ${transfer.product} at the source branch`
      );
    }

    const sourceOldQuantity = sourceStock.quantity;

    // Deduct from source branch
    await sourceStock.deductStock(transfer.quantity);

    // Log transfer out movement
    await createMovementWithOldQuantity(sourceStock, sourceOldQuantity, {
      type: MOVEMENT_TYPES.TRANSFER_OUT,
      reference: { type: 'StockTransfer', id: transfer._id },
      notes: `Transfer to ${transfer.toBranch}`,
      performedBy: req.user._id,
    });

    // Add to destination branch
    let destStock = await Stock.findOne({
      product: transfer.product,
      branch: transfer.toBranch
    });

    const destOldQuantity = destStock ? destStock.quantity : 0;

    if (destStock) {
      destStock.quantity += transfer.quantity;
      await destStock.save();
    } else {
      // Create new stock record at destination with source pricing
      destStock = await Stock.create({
        product: transfer.product,
        branch: transfer.toBranch,
        quantity: transfer.quantity,
        costPrice: sourceStock.costPrice,
        sellingPrice: sourceStock.sellingPrice,
        reorderPoint: sourceStock.reorderPoint,
        reorderQuantity: sourceStock.reorderQuantity,
        supplier: sourceStock.supplier,
        lastRestockedAt: new Date(),
        lastRestockedBy: req.user._id
      });
    }

    // Log transfer in movement
    await createMovementWithOldQuantity(destStock, destOldQuantity, {
      type: MOVEMENT_TYPES.TRANSFER_IN,
      reference: { type: 'StockTransfer', id: transfer._id },
      notes: `Transfer from ${transfer.fromBranch}`,
      performedBy: req.user._id,
    });

  } else if (status === 'cancelled') {
    // Release reserved stock at source
    const sourceStock = await Stock.findOne({
      product: transfer.product,
      branch: transfer.fromBranch
    });

    if (sourceStock) {
      await sourceStock.releaseReservedStock(transfer.quantity);
    }
  }

  await transfer.save();

  const populatedTransfer = await StockTransfer.findById(transfer._id)
    .populate('product', 'sku name brand')
    .populate('fromBranch', 'name code')
    .populate('toBranch', 'name code')
    .populate('initiatedBy', 'name')
    .populate('approvedBy', 'name')
    .populate('receivedBy', 'name');

  // Invalidate cache
  await CacheUtil.delPattern('cache:stock:*');

  // The transfer itself is the payload, not { transfer, statusChange } — the
  // client types this as a StockTransfer and reads `_id` off it to invalidate
  // the detail query. Wrapped, that id was undefined and the screen kept the
  // stale status after a successful write. Same defect as the sales status
  // endpoint; the transition moves to meta, where it is optional to consume.
  return ApiResponse.success(
    res,
    200,
    'Stock transfer status updated successfully',
    populatedTransfer,
    {
      statusChange: {
        from: oldStatus,
        to: status,
        updatedBy: req.user.name,
        updatedAt: new Date()
      }
    }
  );
});

/**
 * @desc    Get stock transfer history
 * @route   GET /api/stock/transfers
 * @access  Private
 */
export const getStockTransfers = asyncHandler(async (req, res) => {
  const { branch, status, page = 1, limit = 20 } = req.query;

  const query = {};
  // A transfer has two sides, so any branch predicate (the requested
  // ?branch= filter, or the non-admin's own-branch scope below) is an
  // "either side" match, not a single-field match. Multiple predicates are
  // combined with $and so they don't clobber each other.
  const andClauses = [];

  if (branch) {
    const branchId = asObjectId(branch);
    if (!branchId) {
      return ApiResponse.error(res, 400, 'Invalid branch ID');
    }
    andClauses.push({ $or: [{ fromBranch: branchId }, { toBranch: branchId }] });
  }

  if (status) {
    // The value stored is the one from the constant, not the one that matched
    // it, which is what makes this a barrier rather than an assertion.
    const transferStatus = asEnum(status, Object.values(STOCK_TRANSFER_STATUS));
    if (!transferStatus) {
      return ApiResponse.error(res, 400, 'Invalid status filter');
    }
    query.status = transferStatus;
  }

  if (req.user.role !== USER_ROLES.ADMIN) {
    if (!req.user.branch) {
      return ApiResponse.error(res, 403, 'User not assigned to any branch');
    }
    andClauses.push({
      $or: [{ fromBranch: req.user.branch }, { toBranch: req.user.branch }]
    });
  }

  if (andClauses.length === 1) {
    Object.assign(query, andClauses[0]);
  } else if (andClauses.length > 1) {
    query.$and = andClauses;
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const [transfers, total] = await Promise.all([
    StockTransfer.find(query)
      .populate('product', 'sku name brand')
      .populate('fromBranch', 'name code')
      .populate('toBranch', 'name code')
      .populate('initiatedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    StockTransfer.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    transfers,
    pageNum,
    limitNum,
    total,
    'Stock transfers retrieved successfully'
  );
});

/**
 * @desc    Get single stock transfer details
 * @route   GET /api/stock/transfers/:id
 * @access  Private
 */
export const getStockTransfer = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const transfer = await StockTransfer.findById(id)
    .populate('product', 'sku name brand images')
    .populate('fromBranch', 'name code address contact')
    .populate('toBranch', 'name code address contact')
    .populate('initiatedBy', 'name email')
    .populate('approvedBy', 'name email')
    .populate('receivedBy', 'name email');

  if (!transfer) {
    return ApiResponse.error(res, 404, 'Stock transfer not found');
  }

  if (req.user.role !== USER_ROLES.ADMIN) {
    // fromBranch/toBranch are populated documents here, not raw ObjectIds -
    // same handling as getServiceInvoice in serviceController.js.
    const fromBranchId = transfer.fromBranch?._id
      ? transfer.fromBranch._id.toString()
      : transfer.fromBranch?.toString();
    const toBranchId = transfer.toBranch?._id
      ? transfer.toBranch._id.toString()
      : transfer.toBranch?.toString();

    if (!canAccessBranch(req.user, fromBranchId) && !canAccessBranch(req.user, toBranchId)) {
      return ApiResponse.error(res, 403, 'Access denied to this transfer');
    }
  }

  return ApiResponse.success(
    res,
    200,
    'Stock transfer retrieved successfully',
    transfer
  );
});

// ============ Stock Movement Methods ============

/**
 * @desc    Get all stock movements with filters
 * @route   GET /api/stock/movements
 * @access  Private (Admin)
 */
export const getMovements = asyncHandler(async (req, res) => {
  const { 
    type, 
    branch, 
    product, 
    startDate, 
    endDate, 
    page = 1, 
    limit = 20 
  } = req.query;

  const query = {};

  if (type) {
    const movementType = asEnum(type, Object.values(MOVEMENT_TYPES));
    if (!movementType) {
      return ApiResponse.error(res, 400, 'Invalid movement type filter');
    }
    query.type = movementType;
  }

  if (branch) {
    const branchId = asObjectId(branch);
    if (!branchId) {
      return ApiResponse.error(res, 400, 'Invalid branch ID');
    }
    query.branch = branchId;
  }

  if (product) {
    const productId = asObjectId(product);
    if (!productId) {
      return ApiResponse.error(res, 400, 'Invalid product ID');
    }
    query.product = productId;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = asDate(startDate);
    }
    if (endDate) {
      query.createdAt.$lte = asDate(endDate);
    }
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const [movements, total] = await Promise.all([
    StockMovement.find(query)
      .populate('product', 'sku name brand')
      .populate('branch', 'name code')
      .populate('supplier', 'name code')
      .populate('performedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    StockMovement.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    movements,
    pageNum,
    limitNum,
    total,
    'Stock movements retrieved successfully'
  );
});

/**
 * @desc    Get movements for a specific stock record
 * @route   GET /api/stock/movements/stock/:stockId
 * @access  Private (Admin, Salesperson)
 */
export const getMovementsByStock = asyncHandler(async (req, res) => {
  const { stockId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  // Verify stock exists
  const stock = await Stock.findById(stockId);
  if (!stock) {
    return ApiResponse.error(res, 404, 'Stock record not found');
  }

  if (!canAccessBranch(req.user, stock.branch)) {
    return ApiResponse.error(res, 403, 'Access denied to this branch');
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const [movements, total] = await Promise.all([
    StockMovement.find({ stock: stockId })
      .populate('product', 'sku name brand')
      .populate('branch', 'name code')
      .populate('supplier', 'name code')
      .populate('performedBy', 'name email')
      .populate({
        path: 'reference.id',
        select: 'orderId transferId status'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    StockMovement.countDocuments({ stock: stockId })
  ]);

  return ApiResponse.paginate(
    res,
    movements,
    pageNum,
    limitNum,
    total,
    'Stock movements retrieved successfully'
  );
});

/**
 * @desc    Get movements for a specific product across all branches
 * @route   GET /api/stock/movements/product/:productId
 * @access  Private (Admin, Salesperson)
 */
export const getMovementsByProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { branch, page = 1, limit = 20 } = req.query;

  // Verify product exists
  const product = await Product.findById(productId);
  if (!product) {
    return ApiResponse.error(res, 404, 'Product not found');
  }

  const query = { product: productId };

  // A product spans branches, so a non-admin is clamped to their own branch
  // (the requested ?branch= filter is ignored for them, same as the
  // silent-clamp pattern in getAllStock/getLowStock) rather than rejected
  // outright. Admins keep the full cross-branch view.
  if (req.user.role === USER_ROLES.ADMIN) {
    if (branch) {
      const branchId = asObjectId(branch);
      if (!branchId) {
        return ApiResponse.error(res, 400, 'Invalid branch ID');
      }
      query.branch = branchId;
    }
  } else {
    if (!req.user.branch) {
      return ApiResponse.error(res, 403, 'User not assigned to any branch');
    }
    query.branch = req.user.branch;
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const [movements, total] = await Promise.all([
    StockMovement.find(query)
      .populate('branch', 'name code')
      .populate('supplier', 'name code')
      .populate('performedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    StockMovement.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    movements,
    pageNum,
    limitNum,
    total,
    'Product movements retrieved successfully'
  );
});

/**
 * @desc    Get movements for a specific branch
 * @route   GET /api/stock/movements/branch/:branchId
 * @access  Private (Admin + Branch Access)
 */
export const getMovementsByBranch = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const { type, startDate, endDate, page = 1, limit = 20 } = req.query;

  // Verify branch exists
  const branch = await Branch.findById(branchId);
  if (!branch) {
    return ApiResponse.error(res, 404, 'Branch not found');
  }

  const query = { branch: branchId };

  if (type) {
    const movementType = asEnum(type, Object.values(MOVEMENT_TYPES));
    if (!movementType) {
      return ApiResponse.error(res, 400, 'Invalid movement type filter');
    }
    query.type = movementType;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = asDate(startDate);
    }
    if (endDate) {
      query.createdAt.$lte = asDate(endDate);
    }
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  const [movements, total] = await Promise.all([
    StockMovement.find(query)
      .populate('product', 'sku name brand')
      .populate('supplier', 'name code')
      .populate('performedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    StockMovement.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    movements,
    pageNum,
    limitNum,
    total,
    `Movements for ${branch.name} retrieved successfully`
  );
});
