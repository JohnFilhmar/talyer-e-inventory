const mongoose = require('mongoose');
const { PHONE_REGEX, normalizePhoneNumber } = require('../utils/phoneValidation');

const serviceOrderSchema = new mongoose.Schema(
  {
    jobNumber: {
      type: String,
      unique: true,
      required: true,
      index: true
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required'],
      index: true
    },
    customer: {
      name: {
        type: String,
        required: [true, 'Customer name is required'],
        trim: true,
        maxlength: [100, 'Customer name cannot exceed 100 characters']
      },
      phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true,
        validate: {
          validator: function(v) {
            if (!v) return false;
            const normalized = normalizePhoneNumber(v);
            return PHONE_REGEX.test(normalized);
          },
          message: 'Phone number must be 10 digits starting with 9 (e.g., 9171234567)'
        },
        set: function(v) {
          // Normalize phone number before saving
          return normalizePhoneNumber(v);
        }
      },
      email: {
        type: String,
        lowercase: true,
        trim: true
      },
      address: {
        type: String,
        maxlength: [200, 'Address cannot exceed 200 characters']
      }
    },
    vehicle: {
      make: {
        type: String,
        trim: true,
        maxlength: [50, 'Vehicle make cannot exceed 50 characters']
      },
      model: {
        type: String,
        trim: true,
        maxlength: [50, 'Vehicle model cannot exceed 50 characters']
      },
      year: {
        type: Number,
        min: [1900, 'Year must be 1900 or later']
      },
      plateNumber: {
        type: String,
        trim: true,
        maxlength: [20, 'Plate number cannot exceed 20 characters']
      },
      vin: {
        type: String,
        trim: true,
        maxlength: [17, 'VIN cannot exceed 17 characters']
      },
      mileage: {
        type: Number,
        min: [0, 'Mileage cannot be negative']
      }
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    description: {
      type: String,
      required: [true, 'Service description is required'],
      maxlength: [2000, 'Description cannot exceed 2000 characters']
    },
    diagnosis: {
      type: String,
      maxlength: [2000, 'Diagnosis cannot exceed 2000 characters']
    },
    partsUsed: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
      sku: String,
      name: String,
      quantity: {
        type: Number,
        required: true,
        min: [1, 'Quantity must be at least 1']
      },
      unitPrice: {
        type: Number,
        required: true,
        min: [0, 'Unit price cannot be negative']
      },
      total: {
        type: Number,
        default: 0
      }
    }],
    laborCost: {
      type: Number,
      default: 0,
      min: [0, 'Labor cost cannot be negative']
    },
    otherCharges: {
      type: Number,
      default: 0,
      min: [0, 'Other charges cannot be negative']
    },
    totalParts: {
      type: Number,
      default: 0
    },
    totalAmount: {
      type: Number,
      default: 0
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
      index: true
    },
    status: {
      type: String,
      enum: ['pending', 'scheduled', 'in-progress', 'completed', 'cancelled'],
      default: 'pending',
      index: true
    },
    payment: {
      method: {
        type: String,
        enum: ['cash', 'card', 'gcash', 'paymaya', 'bank-transfer']
      },
      amountPaid: {
        type: Number,
        default: 0,
        min: [0, 'Amount paid cannot be negative']
      },
      status: {
        type: String,
        enum: ['pending', 'partial', 'paid'],
        default: 'pending'
      },
      paidAt: Date
    },
    scheduledAt: Date,
    startedAt: Date,
    completedAt: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters']
    }
  },
  {
    timestamps: true
  }
);

// Indexes
serviceOrderSchema.index({ branch: 1, createdAt: -1 });
serviceOrderSchema.index({ 'customer.phone': 1 });
serviceOrderSchema.index({ 'vehicle.plateNumber': 1 });

// Auto-generate job number
serviceOrderSchema.pre('save', async function(next) {
  if (this.isNew && !this.jobNumber) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments();
    this.jobNumber = `JOB-${year}-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Calculate totals before saving
serviceOrderSchema.pre('save', function(next) {
  // Calculate part totals
  this.partsUsed.forEach(part => {
    part.total = part.quantity * part.unitPrice;
  });
  
  // Calculate total parts cost
  this.totalParts = this.partsUsed.reduce((sum, part) => sum + part.total, 0);
  
  // Calculate total amount
  this.totalAmount = this.totalParts + this.laborCost + this.otherCharges;
  
  // Update payment status
  if (this.payment.amountPaid === 0) {
    this.payment.status = 'pending';
  } else if (this.payment.amountPaid < this.totalAmount) {
    this.payment.status = 'partial';
  } else if (this.payment.amountPaid >= this.totalAmount) {
    this.payment.status = 'paid';
    if (!this.payment.paidAt) {
      this.payment.paidAt = new Date();
    }
  }
  
  next();
});

const ServiceOrder = mongoose.model('ServiceOrder', serviceOrderSchema);

module.exports = ServiceOrder;
