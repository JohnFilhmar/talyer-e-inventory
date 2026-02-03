const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Supplier name is required'],
      trim: true,
      maxlength: [200, 'Supplier name cannot exceed 200 characters']
    },
    code: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      maxlength: [50, 'Supplier code cannot exceed 50 characters']
    },
    contact: {
      personName: {
        type: String,
        trim: true,
        maxlength: [100, 'Contact person name cannot exceed 100 characters']
      },
      phone: {
        type: String,
        trim: true,
        maxlength: [20, 'Phone number cannot exceed 20 characters']
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
      },
      website: {
        type: String,
        trim: true
      }
    },
    address: {
      street: String,
      city: String,
      province: String,
      postalCode: String,
      country: {
        type: String,
        default: 'Philippines'
      }
    },
    paymentTerms: {
      type: String,
      enum: ['COD', 'Net 7', 'Net 15', 'Net 30', 'Net 60', 'Net 90', 'Custom'],
      default: 'Net 30'
    },
    creditLimit: {
      type: Number,
      min: [0, 'Credit limit cannot be negative'],
      default: 0
    },
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters']
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
// Note: code already has unique: true which auto-creates an index
supplierSchema.index({ name: 1 });
supplierSchema.index({ isActive: 1 });

// Auto-generate code from name if not provided
supplierSchema.pre('save', function(next) {
  if (!this.code && this.name) {
    this.code = this.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }
  next();
});

const Supplier = mongoose.model('Supplier', supplierSchema);

module.exports = Supplier;
