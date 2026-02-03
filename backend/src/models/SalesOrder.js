const mongoose = require('mongoose');

const salesOrderSchema = new mongoose.Schema(
  {
    orderNumber: {
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
        trim: true
      },
      email: {
        type: String,
        lowercase: true,
        trim: true
      },
      address: {
        type: String,
        maxlength: [500, 'Address cannot exceed 500 characters']
      }
    },
    items: [{
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
      sku: {
        type: String,
        required: true
      },
      name: {
        type: String,
        required: true
      },
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
      discount: {
        type: Number,
        default: 0,
        min: [0, 'Discount cannot be negative']
      },
      total: {
        type: Number,
        required: true
      }
    }],
    subtotal: {
      type: Number,
      required: true,
      min: [0, 'Subtotal cannot be negative']
    },
    tax: {
      rate: {
        type: Number,
        default: 0,
        min: [0, 'Tax rate cannot be negative'],
        max: [100, 'Tax rate cannot exceed 100%']
      },
      amount: {
        type: Number,
        default: 0,
        min: [0, 'Tax amount cannot be negative']
      }
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative']
    },
    total: {
      type: Number,
      required: true,
      min: [0, 'Total cannot be negative']
    },
    payment: {
      method: {
        type: String,
        enum: ['cash', 'card', 'gcash', 'paymaya', 'bank-transfer'],
        required: true
      },
      amountPaid: {
        type: Number,
        default: 0,
        min: [0, 'Amount paid cannot be negative']
      },
      change: {
        type: Number,
        default: 0,
        min: [0, 'Change cannot be negative']
      },
      status: {
        type: String,
        enum: ['pending', 'partial', 'paid', 'refunded'],
        default: 'pending'
      },
      paidAt: Date
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'cancelled'],
      default: 'pending',
      index: true
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    completedAt: Date,
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters']
    }
  },
  {
    timestamps: true
  }
);

// Indexes for performance
salesOrderSchema.index({ branch: 1, createdAt: -1 });
salesOrderSchema.index({ 'payment.status': 1 });
salesOrderSchema.index({ 'customer.name': 1 });
salesOrderSchema.index({ 'customer.phone': 1 });

// Auto-generate order number
salesOrderSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderNumber) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments();
    this.orderNumber = `SO-${year}-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Calculate totals before saving
salesOrderSchema.pre('save', function(next) {
  // Calculate item totals
  this.items.forEach(item => {
    item.total = (item.quantity * item.unitPrice) - (item.discount || 0);
  });
  
  // Calculate subtotal
  this.subtotal = this.items.reduce((sum, item) => sum + item.total, 0);
  
  // Calculate tax
  if (this.tax && this.tax.rate) {
    this.tax.amount = this.subtotal * (this.tax.rate / 100);
  } else {
    this.tax = { rate: 0, amount: 0 };
  }
  
  // Calculate final total
  this.total = this.subtotal + this.tax.amount - (this.discount || 0);
  
  // Calculate change
  if (this.payment.amountPaid > this.total) {
    this.payment.change = this.payment.amountPaid - this.total;
  } else {
    this.payment.change = 0;
  }
  
  // Update payment status based on amount paid
  if (this.payment.amountPaid === 0) {
    this.payment.status = 'pending';
  } else if (this.payment.amountPaid < this.total) {
    this.payment.status = 'partial';
  } else if (this.payment.amountPaid >= this.total) {
    this.payment.status = 'paid';
    if (!this.payment.paidAt) {
      this.payment.paidAt = new Date();
    }
  }
  
  next();
});

const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema);

module.exports = SalesOrder;
