import mongoose from 'mongoose';
import { roundCurrency, sumCurrency } from '../utils/currency.js';
import { highestSuffix, nextIdentifier, yearKey } from '../utils/sequence.js';

const salesOrderSchema = new mongoose.Schema(
  {
    orderNumber: {
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
    // Which amount VAT was computed on. `net` means after the order-level
    // discount, which is how a discount shown on the invoice is treated.
    // Orders written before GAP-029 have no value and are read as `gross`
    // (VAT on the subtotal before the order discount), so re-saving one to
    // change its status cannot rewrite a total a customer already holds.
    //
    // Deliberately no schema default: Mongoose applies defaults to
    // documents loaded without the path, so a default of `net` would
    // silently flip every old order the moment it was read. It is set on
    // insert in the totals hook instead.
    taxBasis: {
      type: String,
      enum: ['gross', 'net']
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
    // Refunds (GAP-050). Embedded so a refund is reported in the same
    // sales data as the sale it reverses. Written only by
    // utils/salesRefund.js, which computes every amount.
    refunds: [{
      items: [{
        item: { type: mongoose.Schema.Types.ObjectId, required: true },
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        name: String,
        quantity: { type: Number, required: true, min: [1, 'Refund quantity must be at least 1'] },
        amount: { type: Number, required: true, min: 0 },
        disposition: { type: String, enum: ['sellable', 'discarded'], required: true }
      }],
      amount: { type: Number, required: true, min: 0 },
      reason: { type: String, maxlength: [500, 'Reason cannot exceed 500 characters'] },
      processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      createdAt: { type: Date, default: Date.now }
    }],
    refundedAmount: { type: Number, default: 0, min: 0 },
    refundStatus: {
      type: String,
      enum: ['none', 'partial', 'full'],
      default: 'none',
      index: true
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

// Indexes for performance
salesOrderSchema.index({ branch: 1, createdAt: -1 });
salesOrderSchema.index({ 'payment.status': 1 });
salesOrderSchema.index({ 'customer.name': 1 });
salesOrderSchema.index({ 'customer.phone': 1 });

// Auto-generate order number, atomically. See utils/sequence.js for why
// counting documents cannot do this safely.
//
// pre('validate'), not pre('save'). Mongoose runs validate hooks before save
// hooks, so a value assigned in pre('save') arrives after the check that
// demands it. That is why the old generator here never ran for a required
// field, and why the controller grew a second generator of its own.
salesOrderSchema.pre('validate', async function () {
  if (this.isNew && !this.orderNumber) {
    const year = yearKey();
    const prefix = `SO-${year}-`;
    this.orderNumber = await nextIdentifier({
      key: `salesOrder:${year}`,
      prefix,
      seed: () => highestSuffix(this.constructor, 'orderNumber', prefix),
    });
  }
});

// Calculate totals before saving.
//
// Every assignment here rounds to centavos. These are not display values: the
// stored `total` is what the `>=` below compares `amountPaid` against, and an
// unrounded 27.215999999999998 leaves a customer who paid the 27.22 shown on
// the screen sitting in `partial`. See utils/currency.js.
salesOrderSchema.pre('save', function () {
  // Calculate item totals
  this.items.forEach(item => {
    item.total = roundCurrency((item.quantity * item.unitPrice) - (item.discount || 0));
  });
  
  // Calculate subtotal
  // Summed raw and rounded once, so a half-centavo cannot compound across a
  // long receipt.
  this.subtotal = sumCurrency(this.items.map(item => item.total));
  
  if (this.isNew && !this.taxBasis) {
    this.taxBasis = 'net';
  }

  // VAT base. A `net` order takes the order discount off before VAT, so VAT
  // is never charged on money the discount already gave away. The total
  // formula below is the same for both bases; only the tax differs.
  const taxBase = this.taxBasis === 'net'
    ? Math.max(this.subtotal - (this.discount || 0), 0)
    : this.subtotal;

  // Calculate tax
  if (this.tax && this.tax.rate) {
    this.tax.amount = roundCurrency(taxBase * (this.tax.rate / 100));
  } else {
    this.tax = { rate: 0, amount: 0 };
  }
  
  // Calculate final total
  // Rounding also removes the negative epsilon a full-value line discount
  // produced, which tripped the schema's `min: 0` and rejected the sale with a
  // message describing nothing the operator did.
  this.total = roundCurrency(this.subtotal + this.tax.amount - (this.discount || 0));
  
  // Calculate change
  if (this.payment.amountPaid > this.total) {
    this.payment.change = roundCurrency(this.payment.amountPaid - this.total);
  } else {
    this.payment.change = 0;
  }
  
  // Update payment status based on amount paid. A fully refunded order is
  // terminal: without this the recompute below turns it back into `paid` on
  // the very save that records the refund.
  if (this.refundStatus === 'full') {
    this.payment.status = 'refunded';
  } else if (this.payment.amountPaid === 0) {
    this.payment.status = 'pending';
  } else if (this.payment.amountPaid < this.total) {
    this.payment.status = 'partial';
  } else if (this.payment.amountPaid >= this.total) {
    this.payment.status = 'paid';
    if (!this.payment.paidAt) {
      this.payment.paidAt = new Date();
    }
  }
});

const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema);

export default SalesOrder;
