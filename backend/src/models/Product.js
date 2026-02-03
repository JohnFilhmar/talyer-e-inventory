import mongoose from 'mongoose';

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
    model: {
      type: String,
      trim: true,
      maxlength: [100, 'Model cannot exceed 100 characters']
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
    barcode: {
      type: String,
      trim: true,
      index: true
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
// Note: sku already has unique: true, barcode has index: true - both auto-create indexes
productSchema.index({ name: 'text', description: 'text', brand: 'text' }); // Full-text search
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ isActive: 1 });

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

// Auto-generate SKU if not provided
productSchema.pre('save', async function(next) {
  if (!this.sku) {
    const count = await this.constructor.countDocuments();
    this.sku = `PROD-${String(count + 1).padStart(6, '0')}`;
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

const Product = mongoose.model('Product', productSchema);

export default Product;
