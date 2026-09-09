import mongoose from 'mongoose';
import { highestSuffix, monthKey, nextIdentifier } from '../utils/sequence.js';

const transactionSchema = new mongoose.Schema(
  {
    transactionNumber: {
      type: String,
      unique: true,
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ['sale', 'service', 'refund', 'expense', 'transfer'],
      required: true
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required'],
      index: true
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative']
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'gcash', 'paymaya', 'bank-transfer'],
      required: true
    },
    reference: {
      model: {
        type: String,
        enum: ['SalesOrder', 'ServiceOrder', 'Expense']
      },
      id: {
        type: mongoose.Schema.Types.ObjectId
      }
    },
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes for performance
transactionSchema.index({ branch: 1, createdAt: -1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ paymentMethod: 1 });
transactionSchema.index({ 'reference.model': 1, 'reference.id': 1 });

// Auto-generate transaction number, atomically. The period here is the month
// the `TXN-YYYYMM-` prefix advertises, not the year. See utils/sequence.js.
//
// This hook is now the only generator. Three call sites used to build their own
// number as `TXN-<count>-<timestamp>`, a different format from the one this
// model and the documentation describe, and because they always supplied a
// value this hook never ran. Transactions written before that was fixed keep
// their old numbers; nothing reads the format.
transactionSchema.pre('validate', async function () {
  if (this.isNew && !this.transactionNumber) {
    const period = monthKey();
    const prefix = `TXN-${period}-`;
    this.transactionNumber = await nextIdentifier({
      key: `transaction:${period}`,
      prefix,
      seed: () => highestSuffix(this.constructor, 'transactionNumber', prefix),
    });
  }
});

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction;
