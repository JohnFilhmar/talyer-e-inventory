import mongoose from 'mongoose';
import { PHONE_REGEX, normalizePhoneNumber } from '../utils/phoneValidation.js';
import { roundCurrency, sumCurrency } from '../utils/currency.js';
import { highestSuffix, nextIdentifier, yearKey } from '../utils/sequence.js';

const serviceOrderSchema = new mongoose.Schema(
  {
    jobNumber: {
      type: String,
      unique: true,
      required: true,
      index: true
    },
    // Client-generated idempotency key. Lets a queued offline order be
    // replayed safely: a retry after a dropped connection resolves to the
    // order already created rather than a duplicate. Sparse because online
    // creates do not send one.
    clientRequestId: {
      type: String,
      index: { unique: true, sparse: true },
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

// Auto-generate job number, atomically. See utils/sequence.js, and the note on
// SalesOrder for why this is a validate hook.
serviceOrderSchema.pre('validate', async function () {
  if (this.isNew && !this.jobNumber) {
    const year = yearKey();
    const prefix = `JOB-${year}-`;
    this.jobNumber = await nextIdentifier({
      key: `serviceOrder:${year}`,
      prefix,
      seed: () => highestSuffix(this.constructor, 'jobNumber', prefix),
    });
  }
});

// Calculate totals before saving. Rounded to centavos at every assignment for
// the same reason as SalesOrder: `totalAmount` is what decides payment status.
serviceOrderSchema.pre('save', function () {
  // Calculate part totals
  this.partsUsed.forEach(part => {
    part.total = roundCurrency(part.quantity * part.unitPrice);
  });
  
  // Calculate total parts cost
  this.totalParts = sumCurrency(this.partsUsed.map(part => part.total));
  
  // Calculate total amount
  this.totalAmount = roundCurrency(this.totalParts + this.laborCost + this.otherCharges);
  
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
});

const ServiceOrder = mongoose.model('ServiceOrder', serviceOrderSchema);

export default ServiceOrder;
