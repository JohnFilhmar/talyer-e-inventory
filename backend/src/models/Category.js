import mongoose from 'mongoose';

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
      type: String
    },
    color: {
      type: String,
      match: [/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color']
    },
    sortOrder: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
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
      .replace(/^-|-$/g, '');
  }
  next();
});

// Method to get full category path
categorySchema.methods.getFullPath = async function() {
  let path = [this.name];
  let current = this;
  
  while (current.parent) {
    current = await this.model('Category').findById(current.parent);
    if (!current) {
      break;
    }
    path.unshift(current.name);
  }
  
  return path.join(' > ');
};

const Category = mongoose.model('Category', categorySchema);

export default Category;
