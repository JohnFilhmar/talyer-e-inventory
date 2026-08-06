import mongoose from 'mongoose';
// Imported for its side effect of registering the model, not for a binding.
// `motorcycleModels` below declares `ref: 'MotorcycleModel'`, and Mongoose
// resolves that name at populate time against the global model registry — so
// any consumer that populates fitment without having loaded this module
// separately throws MissingSchemaError. Keeping the import here means loading
// Product is enough, which is what the leaner routers (stock, sales) rely on.
// Safe in this direction only: MotorcycleModel does not import Product.
import './MotorcycleModel.js';

const productSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9-]+$/, 'SKU must be uppercase alphanumeric with hyphens only']
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
    // The manufacturer's model designation for the part itself (e.g. "45120-KVB-901").
    // Named `productModel` rather than `model` so it is never confused with
    // `motorcycleModels` below, which is what the part *fits*. Renamed from
    // `model` — see utils/migrateProductModel.js for the one-off data move.
    productModel: {
      type: String,
      trim: true,
      maxlength: [100, 'Product model cannot exceed 100 characters']
    },
    // The motorcycles this part fits. Many-to-many and appendable like `tags`,
    // because one part legitimately fits several models and one model takes
    // many parts.
    motorcycleModels: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MotorcycleModel'
    }],
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
    barcode: {
      type: String,
      trim: true
      // Uniqueness is a partial index, not `unique: true` — see below.
    },
    images: [{
      url: {
        type: String,
        required: true
      },
      isPrimary: {
        type: Boolean,
        default: false
      }
    }],
    specifications: {
      weight: Number,
      dimensions: {
        length: Number,
        width: Number,
        height: Number
      },
      color: String,
      material: String,
      warranty: String,
      origin: String
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
// Note: sku already has unique: true, which auto-creates its index.

// A barcode identifies one physical product, so it must be unique — scanning it
// at the counter has to resolve to exactly one item. But barcode is optional,
// and a plain `unique: true` indexes missing values as null, which would allow
// only ONE product without a barcode across the whole catalog.
//
// A partial index on `$type: 'string'` covers only documents that actually carry
// a barcode. `sparse` would not be enough on its own: it skips absent fields but
// still indexes explicit nulls and empty strings, so two blank-barcode products
// would collide. The normalisation hook below guarantees a blank barcode is
// stored as absent rather than '' or null, which is what keeps this correct.
productSchema.index(
  { barcode: 1 },
  {
    unique: true,
    partialFilterExpression: { barcode: { $type: 'string' } },
    name: 'barcode_unique'
  }
);

productSchema.index({ name: 'text', description: 'text', brand: 'text' }); // Full-text search
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ isActive: 1 });
// Multikey index — "which parts fit this motorcycle?" is the query the sales
// counter runs constantly, and it is an $in over this array.
productSchema.index({ motorcycleModels: 1 });

// Virtual for primary image
productSchema.virtual('primaryImage').get(function() {
  if (!this.images || !Array.isArray(this.images)) return null;
  const primary = this.images.find(img => img.isPrimary);
  return primary ? primary.url : (this.images.length > 0 ? this.images[0].url : null);
});

// Virtual for profit margin
productSchema.virtual('profitMargin').get(function() {
  if (this.costPrice === 0) return 0;
  return parseFloat(((this.sellingPrice - this.costPrice) / this.costPrice * 100).toFixed(2));
});

// A blank barcode must be stored as absent, never as '' or null, or the partial
// unique index above would treat every blank-barcode product as a collision.
const isBlankBarcode = (value) =>
  value === null || value === undefined || String(value).trim() === '';

// Auto-generate SKU if not provided
productSchema.pre('save', async function(next) {
  if (this.isModified('barcode') && isBlankBarcode(this.barcode)) {
    this.barcode = undefined;
  }

  if (!this.sku) {
    const count = await this.constructor.countDocuments();
    this.sku = `PROD-${String(count + 1).padStart(6, '0')}`;
  }

  // The fitment list is appended to the way tags are, so the same motorcycle
  // can arrive twice from a form that was edited without a reload. Duplicates
  // would double-count the product in every "fits this bike" listing.
  if (this.isModified('motorcycleModels') && Array.isArray(this.motorcycleModels)) {
    const seen = new Set();
    this.motorcycleModels = this.motorcycleModels.filter((id) => {
      const key = String(id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Ensure only one primary image
  if (this.images && this.images.length > 0) {
    const primaryImages = this.images.filter(img => img.isPrimary);
    if (primaryImages.length === 0) {
      // Set first image as primary if none selected
      this.images[0].isPrimary = true;
    } else if (primaryImages.length > 1) {
      // Keep only the first primary, reset others
      let foundFirst = false;
      this.images.forEach(img => {
        if (img.isPrimary && !foundFirst) {
          foundFirst = true;
        } else if (img.isPrimary) {
          img.isPrimary = false;
        }
      });
    }
  }
  
  next();
});

// The same normalisation for the update path — `updateProduct` goes through
// findByIdAndUpdate, which never runs the save hook. Clearing a barcode has to
// $unset it rather than write an empty string, so the cleared product drops out
// of the partial index and frees that barcode for another product.
productSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  const update = this.getUpdate();
  if (!update) return next();

  const target = update.$set && 'barcode' in update.$set ? update.$set : update;
  if (!('barcode' in target)) return next();

  if (isBlankBarcode(target.barcode)) {
    delete target.barcode;
    update.$unset = { ...update.$unset, barcode: '' };
    this.setUpdate(update);
  } else {
    target.barcode = String(target.barcode).trim();
  }

  next();
});

const Product = mongoose.model('Product', productSchema);

export default Product;
