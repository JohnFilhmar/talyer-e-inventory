const mongoose = require('mongoose');

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

// Auto-generate transaction number
transactionSchema.pre('save', async function(next) {
  if (this.isNew && !this.transactionNumber) {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const count = await this.constructor.countDocuments();
    this.transactionNumber = `TXN-${year}${month}-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
