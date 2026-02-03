# Phase 3: Product & Category Management

> **IMPORTANT**: Before implementing any feature in this phase, always refer back to [Planning.md](./Planning.md) and [README.md](../README.md) to ensure alignment with system requirements and scope. This phase builds the product catalog that is essential for the inventory MVP.

---

## 🎯 Phase Objectives

Build the product and category management system that serves as the foundation for inventory tracking. This includes:
- Hierarchical category structure with parent-child relationships
- Comprehensive product model with SKU, barcode, and images
- Product search and filtering capabilities
- Category-based product organization
- Full CRUD operations for both categories and products
- Caching strategy for product catalog

**Expected Outcome**: A fully functional product catalog with searchable products organized by categories, ready for inventory tracking in Phase 4.

---

## 📋 Pre-requisites

### Must Be Completed First ✅
- [x] **Phase 1: Core Infrastructure** - ApiResponse, Cache, Constants, Validation
- [x] **Phase 2: Branch Management** - Branches must exist for stock management

### Required Services Running ✅
- MongoDB running on `localhost:27017`
- Redis running on `localhost:6379` (optional but recommended)
- Backend server running on `http://localhost:5000`
- At least one branch created in the system

---

## 🛠️ Implementation Steps

### Step 1: Create Category Model
**File**: `src/models/Category.js`

**Purpose**: Define hierarchical product categories with parent-child relationships.

**Implementation**:
```javascript
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      trim: true,
      maxlength: [100, 'Category name cannot exceed 100 characters']
    },
    code: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [50, 'Category code cannot exceed 50 characters']
    },
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null
    },
    image: {
      type: String // URL to category image
    },
    color: {
      type: String, // Hex color for UI display
      match: [/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color (e.g., #FF5722)'],
      default: '#607D8B'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    sortOrder: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes
categorySchema.index({ parent: 1 });
categorySchema.index({ isActive: 1 });
categorySchema.index({ sortOrder: 1 });

// Virtual for subcategories
categorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent'
});

// Virtual for product count
categorySchema.virtual('productCount', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'category',
  count: true
});

// Auto-generate code from name if not provided
categorySchema.pre('save', function(next) {
  if (!this.code && this.name) {
    this.code = this.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50);
  }
  next();
});

// Method to get full category path
categorySchema.methods.getFullPath = async function() {
  let path = [this.name];
  let current = this;
  
  while (current.parent) {
    current = await this.model('Category').findById(current.parent);
    if (current) {
      path.unshift(current.name);
    }
  }
  
  return path.join(' > ');
};

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
```

**Testing**:
```javascript
// Create parent category
const parentCategory = await Category.create({
  name: 'Engine Parts',
  description: 'All engine-related components'
});

// Create child category
const childCategory = await Category.create({
  name: 'Oil Filters',
  description: 'Engine oil filters',
  parent: parentCategory._id
});

// Get full path
const path = await childCategory.getFullPath();
console.log(path); // Should output: "Engine Parts > Oil Filters"
```

---

### Step 2: Create Product Model
**File**: `src/models/Product.js`

**Purpose**: Define comprehensive product schema with all necessary fields for inventory management.

**Implementation**:
```javascript
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [50, 'SKU cannot exceed 50 characters']
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [200, 'Product name cannot exceed 200 characters']
    },
    description: {
      type: String,
      maxlength: [2000, 'Description cannot exceed 2000 characters']
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required']
    },
    brand: {
      type: String,
      trim: true,
      maxlength: [100, 'Brand name cannot exceed 100 characters']
    },
    model: {
      type: String,
      trim: true,
      maxlength: [100, 'Model cannot exceed 100 characters']
    },
    images: [{
      url: {
        type: String,
        required: true
      },
      isPrimary: {
        type: Boolean,
        default: false
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }],
    barcode: {
      type: String,
      unique: true,
      sparse: true, // Allow null values
      trim: true
    },
    specifications: {
      type: Map,
      of: String
    },
    weight: {
      value: Number,
      unit: {
        type: String,
        enum: ['kg', 'g', 'lb', 'oz'],
        default: 'kg'
      }
    },
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      unit: {
        type: String,
        enum: ['cm', 'in', 'm'],
        default: 'cm'
      }
    },
    costPrice: {
      type: Number,
      required: [true, 'Cost price is required'],
      min: [0, 'Cost price cannot be negative']
    },
    sellingPrice: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0, 'Selling price cannot be negative']
    },
    taxable: {
      type: Boolean,
      default: true
    },
    warranty: {
      duration: Number,
      unit: {
        type: String,
        enum: ['days', 'months', 'years'],
        default: 'months'
      }
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isDiscontinued: {
      type: Boolean,
      default: false
    },
    tags: [{
      type: String,
      trim: true
    }]
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes
productSchema.index({ sku: 1 });
productSchema.index({ name: 'text', description: 'text', brand: 'text' }); // Full-text search
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ barcode: 1 });

// Virtual for primary image
productSchema.virtual('primaryImage').get(function() {
  const primary = this.images.find(img => img.isPrimary);
  return primary ? primary.url : (this.images.length > 0 ? this.images[0].url : null);
});

// Virtual for profit margin
productSchema.virtual('profitMargin').get(function() {
  if (this.costPrice === 0) return 0;
  return ((this.sellingPrice - this.costPrice) / this.costPrice * 100).toFixed(2);
});

// Auto-generate SKU if not provided
productSchema.pre('save', async function(next) {
  if (!this.sku) {
    const count = await this.model('Product').countDocuments();
    this.sku = `PROD-${String(count + 1).padStart(6, '0')}`;
  }
  
  // Ensure only one primary image
  if (this.images && this.images.length > 0) {
    const primaryImages = this.images.filter(img => img.isPrimary);
    if (primaryImages.length === 0) {
      this.images[0].isPrimary = true;
    } else if (primaryImages.length > 1) {
      // Keep only the first primary
      this.images.forEach((img, index) => {
        img.isPrimary = (index === 0);
      });
    }
  }
  
  next();
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
```

**Testing**:
```javascript
// Create product
const product = await Product.create({
  sku: 'OIL-FILTER-001',
  name: 'Premium Oil Filter',
  description: 'High-performance oil filter for gasoline engines',
  category: categoryId,
  brand: 'ACDelco',
  costPrice: 150,
  sellingPrice: 250,
  barcode: '1234567890123'
});

console.log(product.profitMargin); // Should output: 66.67
```

---

### Step 3: Create Category Controller
**File**: `src/controllers/categoryController.js`

**Purpose**: Handle all category-related business logic.

**Implementation**:
```javascript
const Category = require('../models/Category');
const Product = require('../models/Product');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');
const CacheUtil = require('../utils/cache');
const { CACHE_TTL } = require('../config/constants');

/**
 * @desc    Get all categories
 * @route   GET /api/categories
 * @access  Private
 */
exports.getCategories = asyncHandler(async (req, res) => {
  const { parent, active, includeChildren } = req.query;

  // Build query
  const query = {};
  
  if (parent !== undefined) {
    query.parent = parent === 'null' ? null : parent;
  }
  
  if (active !== undefined) {
    query.isActive = active === 'true';
  }

  // Check cache
  const cacheKey = CacheUtil.generateKey('categories', 'list', JSON.stringify(query));
  const cached = await CacheUtil.get(cacheKey);
  
  if (cached) {
    return ApiResponse.success(res, 200, 'Categories retrieved from cache', cached);
  }

  // Execute query
  let categoriesQuery = Category.find(query).sort({ sortOrder: 1, name: 1 });
  
  if (includeChildren === 'true') {
    categoriesQuery = categoriesQuery.populate('children');
  }
  
  const categories = await categoriesQuery.populate('productCount');

  // Cache the result
  await CacheUtil.set(cacheKey, categories, CACHE_TTL.LONG);

  return ApiResponse.success(res, 200, 'Categories retrieved successfully', categories);
});

/**
 * @desc    Get single category
 * @route   GET /api/categories/:id
 * @access  Private
 */
exports.getCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check cache
  const cacheKey = CacheUtil.generateKey('category', id);
  const cached = await CacheUtil.get(cacheKey);
  
  if (cached) {
    return ApiResponse.success(res, 200, 'Category retrieved from cache', cached);
  }

  const category = await Category.findById(id)
    .populate('parent', 'name code')
    .populate('children')
    .populate('productCount');

  if (!category) {
    return ApiResponse.error(res, 404, 'Category not found');
  }

  // Get full path
  const fullPath = await category.getFullPath();
  const categoryData = category.toObject();
  categoryData.fullPath = fullPath;

  // Cache the result
  await CacheUtil.set(cacheKey, categoryData, CACHE_TTL.LONG);

  return ApiResponse.success(res, 200, 'Category retrieved successfully', categoryData);
});

/**
 * @desc    Get category children (subcategories)
 * @route   GET /api/categories/:id/children
 * @access  Private
 */
exports.getCategoryChildren = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const children = await Category.find({ parent: id, isActive: true })
    .sort({ sortOrder: 1, name: 1 })
    .populate('productCount');

  return ApiResponse.success(
    res,
    200,
    'Subcategories retrieved successfully',
    children
  );
});

/**
 * @desc    Create new category
 * @route   POST /api/categories
 * @access  Private (Admin only)
 */
exports.createCategory = asyncHandler(async (req, res) => {
  const { name, code, description, parent, image, color, sortOrder } = req.body;

  // If parent is provided, check if it exists
  if (parent) {
    const parentCategory = await Category.findById(parent);
    if (!parentCategory) {
      return ApiResponse.error(res, 404, 'Parent category not found');
    }
  }

  // Create category
  const category = await Category.create({
    name,
    code,
    description,
    parent: parent || null,
    image,
    color,
    sortOrder
  });

  // Invalidate cache
  await CacheUtil.delPattern('cache:categories:*');

  return ApiResponse.success(res, 201, 'Category created successfully', category);
});

/**
 * @desc    Update category
 * @route   PUT /api/categories/:id
 * @access  Private (Admin only)
 */
exports.updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let category = await Category.findById(id);

  if (!category) {
    return ApiResponse.error(res, 404, 'Category not found');
  }

  // Check if new parent is valid
  if (req.body.parent) {
    // Cannot set self as parent
    if (req.body.parent === id) {
      return ApiResponse.error(res, 400, 'Category cannot be its own parent');
    }
    
    const parentCategory = await Category.findById(req.body.parent);
    if (!parentCategory) {
      return ApiResponse.error(res, 404, 'Parent category not found');
    }
  }

  // Update category
  category = await Category.findByIdAndUpdate(
    id,
    req.body,
    { new: true, runValidators: true }
  ).populate('parent', 'name code');

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('category', id));
  await CacheUtil.delPattern('cache:categories:*');

  return ApiResponse.success(res, 200, 'Category updated successfully', category);
});

/**
 * @desc    Delete category
 * @route   DELETE /api/categories/:id
 * @access  Private (Admin only)
 */
exports.deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const category = await Category.findById(id);

  if (!category) {
    return ApiResponse.error(res, 404, 'Category not found');
  }

  // Check if category has products
  const productCount = await Product.countDocuments({ category: id });
  if (productCount > 0) {
    return ApiResponse.error(
      res,
      400,
      `Cannot delete category. ${productCount} product(s) are assigned to this category.`
    );
  }

  // Check if category has children
  const childrenCount = await Category.countDocuments({ parent: id });
  if (childrenCount > 0) {
    return ApiResponse.error(
      res,
      400,
      `Cannot delete category. It has ${childrenCount} subcategory(ies).`
    );
  }

  // Soft delete
  category.isActive = false;
  await category.save();

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('category', id));
  await CacheUtil.delPattern('cache:categories:*');

  return ApiResponse.success(
    res,
    200,
    'Category deactivated successfully',
    { id: category._id, name: category.name, isActive: false }
  );
});
```

---

### Step 4: Create Product Controller
**File**: `src/controllers/productController.js`

**Purpose**: Handle all product-related business logic including search and filtering.

**Implementation**:
```javascript
const Product = require('../models/Product');
const Category = require('../models/Category');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');
const CacheUtil = require('../utils/cache');
const { CACHE_TTL, PAGINATION } = require('../config/constants');

/**
 * @desc    Get all products with filters
 * @route   GET /api/products
 * @access  Private
 */
exports.getProducts = asyncHandler(async (req, res) => {
  const {
    category,
    brand,
    active,
    discontinued,
    search,
    minPrice,
    maxPrice,
    page = 1,
    limit = PAGINATION.DEFAULT_LIMIT,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Build query
  const query = {};
  
  if (category) {
    query.category = category;
  }
  
  if (brand) {
    query.brand = { $regex: brand, $options: 'i' };
  }
  
  if (active !== undefined) {
    query.isActive = active === 'true';
  }
  
  if (discontinued !== undefined) {
    query.isDiscontinued = discontinued === 'true';
  }
  
  if (search) {
    query.$text = { $search: search };
  }
  
  if (minPrice || maxPrice) {
    query.sellingPrice = {};
    if (minPrice) query.sellingPrice.$gte = parseFloat(minPrice);
    if (maxPrice) query.sellingPrice.$lte = parseFloat(maxPrice);
  }

  // Pagination
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), PAGINATION.MAX_LIMIT);
  const skip = (pageNum - 1) * limitNum;

  // Sort
  const sort = {};
  sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

  // Execute query
  const [products, total] = await Promise.all([
    Product.find(query)
      .populate('category', 'name code')
      .skip(skip)
      .limit(limitNum)
      .sort(sort),
    Product.countDocuments(query)
  ]);

  return ApiResponse.paginate(
    res,
    products,
    pageNum,
    limitNum,
    total,
    'Products retrieved successfully'
  );
});

/**
 * @desc    Get single product
 * @route   GET /api/products/:id
 * @access  Private
 */
exports.getProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check cache
  const cacheKey = CacheUtil.generateKey('product', id);
  const cached = await CacheUtil.get(cacheKey);
  
  if (cached) {
    return ApiResponse.success(res, 200, 'Product retrieved from cache', cached);
  }

  const product = await Product.findById(id).populate('category', 'name code color');

  if (!product) {
    return ApiResponse.error(res, 404, 'Product not found');
  }

  // Cache the result
  await CacheUtil.set(cacheKey, product, CACHE_TTL.LONG);

  return ApiResponse.success(res, 200, 'Product retrieved successfully', product);
});

/**
 * @desc    Search products (advanced)
 * @route   GET /api/products/search
 * @access  Private
 */
exports.searchProducts = asyncHandler(async (req, res) => {
  const { q, limit = 10 } = req.query;

  if (!q) {
    return ApiResponse.error(res, 400, 'Search query is required');
  }

  // Check cache
  const cacheKey = CacheUtil.generateKey('products', 'search', q, limit);
  const cached = await CacheUtil.get(cacheKey);
  
  if (cached) {
    return ApiResponse.success(res, 200, 'Search results from cache', cached);
  }

  const products = await Product.find({
    $or: [
      { name: { $regex: q, $options: 'i' } },
      { sku: { $regex: q, $options: 'i' } },
      { brand: { $regex: q, $options: 'i' } },
      { barcode: { $regex: q, $options: 'i' } }
    ],
    isActive: true
  })
    .select('sku name brand sellingPrice primaryImage category')
    .populate('category', 'name')
    .limit(parseInt(limit));

  // Cache for short time
  await CacheUtil.set(cacheKey, products, CACHE_TTL.SHORT);

  return ApiResponse.success(res, 200, 'Search completed', products);
});

/**
 * @desc    Create new product
 * @route   POST /api/products
 * @access  Private (Admin only)
 */
exports.createProduct = asyncHandler(async (req, res) => {
  const {
    sku,
    name,
    description,
    category,
    brand,
    model,
    images,
    barcode,
    specifications,
    weight,
    dimensions,
    costPrice,
    sellingPrice,
    taxable,
    warranty,
    tags
  } = req.body;

  // Check if category exists
  const categoryExists = await Category.findById(category);
  if (!categoryExists) {
    return ApiResponse.error(res, 404, 'Category not found');
  }

  // Create product
  const product = await Product.create({
    sku,
    name,
    description,
    category,
    brand,
    model,
    images,
    barcode,
    specifications,
    weight,
    dimensions,
    costPrice,
    sellingPrice,
    taxable,
    warranty,
    tags
  });

  const populatedProduct = await Product.findById(product._id).populate('category', 'name code');

  // Invalidate cache
  await CacheUtil.delPattern('cache:products:*');
  await CacheUtil.delPattern('cache:category:*');

  return ApiResponse.success(res, 201, 'Product created successfully', populatedProduct);
});

/**
 * @desc    Update product
 * @route   PUT /api/products/:id
 * @access  Private (Admin only)
 */
exports.updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let product = await Product.findById(id);

  if (!product) {
    return ApiResponse.error(res, 404, 'Product not found');
  }

  // If category is being updated, check if it exists
  if (req.body.category) {
    const categoryExists = await Category.findById(req.body.category);
    if (!categoryExists) {
      return ApiResponse.error(res, 404, 'Category not found');
    }
  }

  // Update product
  product = await Product.findByIdAndUpdate(
    id,
    req.body,
    { new: true, runValidators: true }
  ).populate('category', 'name code');

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('product', id));
  await CacheUtil.delPattern('cache:products:*');

  return ApiResponse.success(res, 200, 'Product updated successfully', product);
});

/**
 * @desc    Delete product
 * @route   DELETE /api/products/:id
 * @access  Private (Admin only)
 */
exports.deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const product = await Product.findById(id);

  if (!product) {
    return ApiResponse.error(res, 404, 'Product not found');
  }

  // Soft delete
  product.isActive = false;
  product.isDiscontinued = true;
  await product.save();

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('product', id));
  await CacheUtil.delPattern('cache:products:*');

  return ApiResponse.success(
    res,
    200,
    'Product discontinued successfully',
    { id: product._id, name: product.name, isActive: false, isDiscontinued: true }
  );
});

/**
 * @desc    Add product image
 * @route   POST /api/products/:id/images
 * @access  Private (Admin only)
 */
exports.addProductImage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { url, isPrimary } = req.body;

  if (!url) {
    return ApiResponse.error(res, 400, 'Image URL is required');
  }

  const product = await Product.findById(id);

  if (!product) {
    return ApiResponse.error(res, 404, 'Product not found');
  }

  // If setting as primary, remove primary flag from others
  if (isPrimary) {
    product.images.forEach(img => {
      img.isPrimary = false;
    });
  }

  product.images.push({ url, isPrimary: isPrimary || false });
  await product.save();

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('product', id));

  return ApiResponse.success(res, 201, 'Image added successfully', product);
});

/**
 * @desc    Delete product image
 * @route   DELETE /api/products/:id/images/:imageId
 * @access  Private (Admin only)
 */
exports.deleteProductImage = asyncHandler(async (req, res) => {
  const { id, imageId } = req.params;

  const product = await Product.findById(id);

  if (!product) {
    return ApiResponse.error(res, 404, 'Product not found');
  }

  const imageIndex = product.images.findIndex(
    img => img._id.toString() === imageId
  );

  if (imageIndex === -1) {
    return ApiResponse.error(res, 404, 'Image not found');
  }

  product.images.splice(imageIndex, 1);
  await product.save();

  // Invalidate cache
  await CacheUtil.del(CacheUtil.generateKey('product', id));

  return ApiResponse.success(res, 200, 'Image deleted successfully', product);
});
```

---

### Step 5: Create Category Routes
**File**: `src/routes/categoryRoutes.js`

**Purpose**: Define API endpoints for category operations.

**Implementation**:
```javascript
const express = require('express');
const { body, param } = require('express-validator');
const {
  getCategories,
  getCategory,
  getCategoryChildren,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/categoryController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const cacheMiddleware = require('../middleware/cache');
const { USER_ROLES, CACHE_TTL } = require('../config/constants');

const router = express.Router();

// Validation
const categoryIdValidation = [
  param('id').isMongoId().withMessage('Invalid category ID format'),
  validate
];

const createCategoryValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Category name is required')
    .isLength({ max: 100 }).withMessage('Category name cannot exceed 100 characters'),
  body('code')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Category code cannot exceed 50 characters')
    .matches(/^[A-Z0-9-]+$/).withMessage('Category code must be uppercase alphanumeric with hyphens'),
  body('parent')
    .optional()
    .isMongoId().withMessage('Invalid parent category ID'),
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color must be a valid hex color'),
  validate
];

// Routes
router.get('/', protect, cacheMiddleware('categories', CACHE_TTL.LONG), getCategories);
router.get('/:id', protect, categoryIdValidation, getCategory);
router.get('/:id/children', protect, categoryIdValidation, getCategoryChildren);

router.post(
  '/',
  protect,
  authorize(USER_ROLES.ADMIN),
  createCategoryValidation,
  createCategory
);

router.put(
  '/:id',
  protect,
  authorize(USER_ROLES.ADMIN),
  categoryIdValidation,
  updateCategory
);

router.delete(
  '/:id',
  protect,
  authorize(USER_ROLES.ADMIN),
  categoryIdValidation,
  deleteCategory
);

module.exports = router;
```

---

### Step 6: Create Product Routes
**File**: `src/routes/productRoutes.js`

**Purpose**: Define API endpoints for product operations.

**Implementation**:
```javascript
const express = require('express');
const { body, param, query } = require('express-validator');
const {
  getProducts,
  getProduct,
  searchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  addProductImage,
  deleteProductImage
} = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { USER_ROLES } = require('../config/constants');

const router = express.Router();

// Validation
const productIdValidation = [
  param('id').isMongoId().withMessage('Invalid product ID format'),
  validate
];

const createProductValidation = [
  body('sku')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('SKU cannot exceed 50 characters')
    .matches(/^[A-Z0-9-]+$/).withMessage('SKU must be uppercase alphanumeric with hyphens'),
  body('name')
    .trim()
    .notEmpty().withMessage('Product name is required')
    .isLength({ max: 200 }).withMessage('Product name cannot exceed 200 characters'),
  body('category')
    .notEmpty().withMessage('Category is required')
    .isMongoId().withMessage('Invalid category ID'),
  body('costPrice')
    .notEmpty().withMessage('Cost price is required')
    .isFloat({ min: 0 }).withMessage('Cost price must be a positive number'),
  body('sellingPrice')
    .notEmpty().withMessage('Selling price is required')
    .isFloat({ min: 0 }).withMessage('Selling price must be a positive number'),
  body('barcode')
    .optional()
    .trim()
    .isLength({ min: 8, max: 20 }).withMessage('Barcode must be between 8 and 20 characters'),
  validate
];

const addImageValidation = [
  param('id').isMongoId().withMessage('Invalid product ID format'),
  body('url').notEmpty().withMessage('Image URL is required').isURL().withMessage('Invalid URL format'),
  validate
];

// Routes
router.get('/search', protect, searchProducts);
router.get('/', protect, getProducts);
router.get('/:id', protect, productIdValidation, getProduct);

router.post(
  '/',
  protect,
  authorize(USER_ROLES.ADMIN),
  createProductValidation,
  createProduct
);

router.put(
  '/:id',
  protect,
  authorize(USER_ROLES.ADMIN),
  productIdValidation,
  updateProduct
);

router.delete(
  '/:id',
  protect,
  authorize(USER_ROLES.ADMIN),
  productIdValidation,
  deleteProduct
);

router.post(
  '/:id/images',
  protect,
  authorize(USER_ROLES.ADMIN),
  addImageValidation,
  addProductImage
);

router.delete(
  '/:id/images/:imageId',
  protect,
  authorize(USER_ROLES.ADMIN),
  productIdValidation,
  deleteProductImage
);

module.exports = router;
```

---

### Step 7: Mount Routes in Server
**File**: `src/server.js` (MODIFY EXISTING)

**Purpose**: Add category and product routes to the Express application.

**Implementation** - Add these imports and route mounts:
```javascript
// Import routes (add with other imports)
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');

// Mount routes (add after existing routes)
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
```

---

## ✅ Phase 3 Completion Checklist

### Files Created
- [ ] `src/models/Category.js` - Category model with hierarchy
- [ ] `src/models/Product.js` - Product model with full schema
- [ ] `src/controllers/categoryController.js` - All 6 category functions
- [ ] `src/controllers/productController.js` - All 9 product functions
- [ ] `src/routes/categoryRoutes.js` - Category routes with validation
- [ ] `src/routes/productRoutes.js` - Product routes with validation

### Files Modified
- [ ] `src/server.js` - Category and product routes mounted

### Functionality Testing
- [ ] Create parent category successfully
- [ ] Create child category with parent reference
- [ ] Get category full path works correctly
- [ ] Cannot delete category with products
- [ ] Cannot delete category with children
- [ ] Create product with all fields
- [ ] Auto-generate SKU if not provided
- [ ] Product search works (name, SKU, brand, barcode)
- [ ] Product filtering by category works
- [ ] Product filtering by price range works
- [ ] Add product image works
- [ ] Set primary image works
- [ ] Delete product image works
- [ ] Full-text search is working
- [ ] Pagination works correctly
- [ ] Cache is working for categories and products

### Manual Testing Endpoints

```bash
# 1. Create category
POST http://localhost:5000/api/categories
Headers: { "Authorization": "Bearer <admin_token>" }
Body: {
  "name": "Engine Parts",
  "description": "All engine-related components",
  "color": "#FF5722"
}
Expected: 201 with created category

# 2. Create subcategory
POST http://localhost:5000/api/categories
Headers: { "Authorization": "Bearer <admin_token>" }
Body: {
  "name": "Oil Filters",
  "parent": "<parent_category_id>",
  "description": "Engine oil filters"
}
Expected: 201 with created category

# 3. Get all categories
GET http://localhost:5000/api/categories
Headers: { "Authorization": "Bearer <token>" }
Expected: 200 with categories list

# 4. Create product
POST http://localhost:5000/api/products
Headers: { "Authorization": "Bearer <admin_token>" }
Body: {
  "sku": "OIL-FILTER-001",
  "name": "Premium Oil Filter",
  "description": "High-performance oil filter",
  "category": "<category_id>",
  "brand": "ACDelco",
  "costPrice": 150,
  "sellingPrice": 250,
  "barcode": "1234567890123"
}
Expected: 201 with created product

# 5. Search products
GET http://localhost:5000/api/products/search?q=oil
Headers: { "Authorization": "Bearer <token>" }
Expected: 200 with matching products

# 6. Get products with filters
GET http://localhost:5000/api/products?category=<id>&minPrice=100&maxPrice=500
Headers: { "Authorization": "Bearer <token>" }
Expected: 200 with filtered products

# 7. Add product image
POST http://localhost:5000/api/products/<product_id>/images
Headers: { "Authorization": "Bearer <admin_token>" }
Body: {
  "url": "https://example.com/image.jpg",
  "isPrimary": true
}
Expected: 201 with updated product
```

---

## 📊 Expected Outcomes

After completing Phase 3:

1. **Hierarchical Categories** - Parent-child category structure
2. **Comprehensive Product Catalog** - All product details stored
3. **Search & Filter** - Fast product search and filtering
4. **Image Management** - Multiple images per product
5. **Auto-generated Codes** - SKU and category codes auto-generated
6. **Cached Data** - Improved performance with Redis
7. **Full Validation** - Input validation on all endpoints

---

## 🚀 Next Steps

1. **Create Phase 3 Completion Document**: `backend/Phase-3-done.md`
2. **Proceed to Phase 4**: Inventory & Stock Management (branch-specific pricing, stock tracking)

---

## 📝 Notes

- **SKU Format**: Uppercase alphanumeric with hyphens (e.g., OIL-FILTER-001)
- **Full-Text Search**: MongoDB text index on name, description, brand
- **Primary Image**: Only one image can be primary per product
- **Soft Delete**: Products are discontinued, not permanently deleted
- **Category Hierarchy**: Maximum recommended depth is 3 levels

---

## ⚠️ Common Issues & Solutions

### Issue 1: Duplicate SKU Error
**Solution**: Ensure SKU is unique before creating product

### Issue 2: Category Not Found
**Solution**: Verify category ID exists before creating product

### Issue 3: Full-Text Search Not Working
**Solution**: Ensure text index exists: `db.products.createIndex({ name: "text", description: "text", brand: "text" })`

---

## 📚 References

- [Planning.md](./Planning.md) - Phase 3 details (lines 186-829)
- [Phase-2.md](./Phase-2.md) - Branch management (required)

---

> **COMPLETION NOTE**: Create `Phase-3-done.md` with all implemented features, sample category/product IDs, and test results. Then proceed to `Phase-4.md` for Stock & Inventory Management.
