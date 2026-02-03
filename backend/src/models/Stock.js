import mongoose from 'mongoose';

const stockSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product is required']
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required']
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0, 'Quantity cannot be negative'],
      default: 0
    },
    reservedQuantity: {
      type: Number,
      min: [0, 'Reserved quantity cannot be negative'],
      default: 0
    },
    reorderPoint: {
      type: Number,
      min: [0, 'Reorder point cannot be negative'],
      default: 10
    },
    reorderQuantity: {
      type: Number,
      min: [0, 'Reorder quantity cannot be negative'],
      default: 50
    },
    costPrice: {
      type: Number,
      required: [true, 'Cost price is required'],
      min: [0, 'Cost price cannot be negative']
    },
    sellingPrice: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0, 'Selling price cannot be negative']
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier'
    },
    location: {
      type: String,
      trim: true,
      maxlength: [100, 'Location cannot exceed 100 characters']
    },
    lastRestockedAt: {
      type: Date
    },
    lastRestockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// CRITICAL: Compound unique index - one stock record per product+branch combination
stockSchema.index({ product: 1, branch: 1 }, { unique: true });
stockSchema.index({ branch: 1 });
stockSchema.index({ quantity: 1 });

// Virtual for available quantity
stockSchema.virtual('available').get(function() {
  return Math.max(0, this.quantity - this.reservedQuantity);
});

// Alias for backward compatibility
stockSchema.virtual('availableQuantity').get(function() {
  return this.available;
});

// Virtual to check if stock is low
stockSchema.virtual('isLowStock').get(function() {
  return this.quantity <= this.reorderPoint;
});

// Virtual for stock status
stockSchema.virtual('stockStatus').get(function() {
  if (this.quantity === 0) return 'out-of-stock';
  if (this.quantity <= this.reorderPoint) return 'low-stock';
  return 'in-stock';
});

// Method to check if sufficient stock is available
stockSchema.methods.hasSufficientStock = function(requestedQuantity) {
  return this.available >= requestedQuantity;
};

// Method to reserve stock (for orders)
stockSchema.methods.reserveStock = async function(quantity) {
  if (!this.hasSufficientStock(quantity)) {
    throw new Error('Insufficient stock available');
  }
  this.reservedQuantity += quantity;
  return await this.save();
};

// Method to release reserved stock (order cancelled)
stockSchema.methods.releaseReservedStock = async function(quantity) {
  this.reservedQuantity = Math.max(0, this.reservedQuantity - quantity);
  return await this.save();
};

// Method to deduct stock (order completed)
stockSchema.methods.deductStock = async function(quantity) {
  if (quantity > this.quantity) {
    throw new Error('Cannot deduct more than available quantity');
  }
  this.quantity -= quantity;
  this.reservedQuantity = Math.max(0, this.reservedQuantity - quantity);
  return await this.save();
};

const Stock = mongoose.model('Stock', stockSchema);

export default Stock;
