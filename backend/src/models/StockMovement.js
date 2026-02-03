import mongoose from 'mongoose';

/**
 * Stock Movement Schema
 * 
 * Tracks all stock quantity changes for audit purposes.
 * Every restock, adjustment, sale, service, or transfer creates a movement record.
 */
const stockMovementSchema = new mongoose.Schema(
  {
    // Auto-generated movement ID (SM-2026-000001)
    movementId: {
      type: String,
      unique: true,
    },

    // The stock record affected
    stock: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Stock',
      required: [true, 'Stock reference is required'],
    },

    // Denormalized for easier querying
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
    },

    // Denormalized for easier querying
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch reference is required'],
    },

    // Type of movement
    type: {
      type: String,
      enum: [
        'restock',           // Adding inventory from supplier
        'adjustment_add',    // Manual increase (found, returned, correction)
        'adjustment_remove', // Manual decrease (damaged, lost, expired)
        'sale',              // Sold to customer
        'sale_cancel',       // Order cancelled, stock returned
        'service_use',       // Used as parts in service
        'transfer_out',      // Sent to another branch
        'transfer_in',       // Received from another branch
        'initial',           // Initial stock setup
      ],
      required: [true, 'Movement type is required'],
    },

    // Quantity changed (positive for additions, negative for removals)
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
    },

    // Stock quantity before this movement
    quantityBefore: {
      type: Number,
      required: [true, 'Quantity before is required'],
    },

    // Stock quantity after this movement
    quantityAfter: {
      type: Number,
      required: [true, 'Quantity after is required'],
    },

    // Reason for adjustment (required for adjustment types)
    reason: {
      type: String,
      maxlength: [200, 'Reason cannot exceed 200 characters'],
    },

    // Reference to related document (order, transfer, etc.)
    reference: {
      type: {
        type: String,
        enum: ['SalesOrder', 'ServiceOrder', 'StockTransfer'],
      },
      id: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'reference.type',
      },
    },

    // Supplier for restocks
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
    },

    // User who performed this action
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Performed by user is required'],
    },

    // Additional notes
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
stockMovementSchema.index({ stock: 1, createdAt: -1 });
stockMovementSchema.index({ product: 1, createdAt: -1 });
stockMovementSchema.index({ branch: 1, createdAt: -1 });
stockMovementSchema.index({ type: 1, createdAt: -1 });
stockMovementSchema.index({ performedBy: 1, createdAt: -1 });
stockMovementSchema.index({ createdAt: -1 });
stockMovementSchema.index({ movementId: 1 });

// Auto-generate movementId before saving
stockMovementSchema.pre('save', async function (next) {
  if (!this.movementId) {
    const year = new Date().getFullYear();
    const prefix = `SM-${year}-`;

    // Find the last movement of this year
    const lastMovement = await this.constructor
      .findOne({ movementId: { $regex: `^${prefix}` } })
      .sort({ movementId: -1 })
      .select('movementId');

    let nextNumber = 1;
    if (lastMovement && lastMovement.movementId) {
      const lastNumber = parseInt(lastMovement.movementId.split('-')[2], 10);
      nextNumber = lastNumber + 1;
    }

    this.movementId = `${prefix}${String(nextNumber).padStart(6, '0')}`;
  }
  next();
});

// Virtual for formatted quantity display
stockMovementSchema.virtual('quantityDisplay').get(function () {
  return this.quantity > 0 ? `+${this.quantity}` : `${this.quantity}`;
});

// Ensure virtuals are included in JSON
stockMovementSchema.set('toJSON', { virtuals: true });
stockMovementSchema.set('toObject', { virtuals: true });

const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

export default StockMovement;
