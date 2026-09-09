import mongoose from 'mongoose';
import { highestSuffix, nextIdentifier, yearKey } from '../utils/sequence.js';

const stockTransferSchema = new mongoose.Schema(
  {
    transferNumber: {
      type: String,
      unique: true,
      uppercase: true
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product is required']
    },
    fromBranch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Source branch is required']
    },
    toBranch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Destination branch is required']
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1']
    },
    status: {
      type: String,
      enum: ['pending', 'in-transit', 'completed', 'cancelled'],
      default: 'pending'
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    shippedAt: {
      type: Date
    },
    receivedAt: {
      type: Date
    },
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot exceed 500 characters']
    }
  },
  {
    timestamps: true
  }
);

// Indexes
// Note: transferNumber already has unique: true which auto-creates an index
stockTransferSchema.index({ fromBranch: 1, toBranch: 1 });
stockTransferSchema.index({ status: 1 });
stockTransferSchema.index({ createdAt: -1 });

// Auto-generate transfer number, atomically. See utils/sequence.js.
stockTransferSchema.pre('validate', async function () {
  if (this.isNew && !this.transferNumber) {
    const year = yearKey();
    const prefix = `TR-${year}-`;
    this.transferNumber = await nextIdentifier({
      key: `stockTransfer:${year}`,
      prefix,
      seed: () => highestSuffix(this.constructor, 'transferNumber', prefix),
    });
  }
});

// Validate that fromBranch and toBranch are different
stockTransferSchema.pre('save', function () {
  if (this.fromBranch.toString() === this.toBranch.toString()) {
    throw new Error('Source and destination branches must be different');
  }
});

const StockTransfer = mongoose.model('StockTransfer', stockTransferSchema);

export default StockTransfer;
