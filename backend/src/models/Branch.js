import mongoose from 'mongoose';

const branchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Branch name is required'],
      unique: true,
      trim: true,
      maxlength: [100, 'Branch name cannot exceed 100 characters']
    },
    code: {
      type: String,
      required: [true, 'Branch code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9-]+$/, 'Branch code must be alphanumeric with hyphens only'],
      maxlength: [20, 'Branch code cannot exceed 20 characters']
    },
    address: {
      street: {
        type: String,
        required: [true, 'Street address is required']
      },
      city: {
        type: String,
        required: [true, 'City is required']
      },
      province: {
        type: String,
        required: [true, 'Province is required']
      },
      postalCode: {
        type: String
      },
      country: {
        type: String,
        default: 'Philippines'
      }
    },
    contact: {
      phone: {
        type: String,
        required: [true, 'Phone number is required'],
        match: [/^[\d\s\-\+\(\)]+$/, 'Invalid phone number format']
      },
      email: {
        type: String,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Invalid email format']
      },
      fax: String
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    settings: {
      taxRate: {
        type: Number,
        default: 0,
        min: [0, 'Tax rate cannot be negative'],
        max: [100, 'Tax rate cannot exceed 100%']
      },
      currency: {
        type: String,
        default: 'PHP',
        enum: ['PHP', 'USD', 'EUR']
      },
      timezone: {
        type: String,
        default: 'Asia/Manila'
      },
      businessHours: {
        monday: { open: String, close: String },
        tuesday: { open: String, close: String },
        wednesday: { open: String, close: String },
        thursday: { open: String, close: String },
        friday: { open: String, close: String },
        saturday: { open: String, close: String },
        sunday: { open: String, close: String }
      },
      allowNegativeStock: {
        type: Boolean,
        default: false
      },
      lowStockThreshold: {
        type: Number,
        default: 10,
        min: [0, 'Threshold cannot be negative']
      }
    },
    isActive: {
      type: Boolean,
      default: true
    },
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters']
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes
// Note: code and name already have unique: true which auto-creates indexes
branchSchema.index({ isActive: 1 });
branchSchema.index({ 'address.city': 1 });

// Virtual populate for staff count
branchSchema.virtual('staffCount', {
  ref: 'User',
  localField: '_id',
  foreignField: 'branch',
  count: true
});

// Method to get full address as string
branchSchema.methods.getFullAddress = function() {
  const addr = this.address;
  return `${addr.street}, ${addr.city}, ${addr.province} ${addr.postalCode || ''}, ${addr.country}`.trim();
};

const Branch = mongoose.model('Branch', branchSchema);

export default Branch;
