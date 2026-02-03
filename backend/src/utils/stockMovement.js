const StockMovement = require('../models/StockMovement');
const Stock = require('../models/Stock');

/**
 * Stock Movement Utility
 * 
 * Helper functions for creating stock movement records consistently
 * across all controllers that modify stock.
 */

/**
 * Create a stock movement record
 * 
 * @param {Object} params - Movement parameters
 * @param {Object|String} params.stock - Stock document or ID
 * @param {String} params.type - Movement type
 * @param {Number} params.quantity - Change amount (positive for add, negative for remove)
 * @param {String} [params.reason] - Reason for adjustment
 * @param {Object} [params.reference] - Reference to related document { type, id }
 * @param {String} [params.supplier] - Supplier ID for restocks
 * @param {String} [params.notes] - Additional notes
 * @param {String} params.performedBy - User ID who performed the action
 * @returns {Promise<Object>} Created movement record
 */
async function createMovement({
  stock,
  type,
  quantity,
  reason,
  reference,
  supplier,
  notes,
  performedBy,
}) {
  // Get the stock document if only ID was provided
  let stockDoc = stock;
  if (typeof stock === 'string' || stock instanceof require('mongoose').Types.ObjectId) {
    stockDoc = await Stock.findById(stock);
    if (!stockDoc) {
      throw new Error('Stock record not found');
    }
  }

  // Calculate before/after quantities
  // Note: The actual stock quantity should already be updated by the caller
  // So quantityAfter is the current quantity, and quantityBefore is current - change
  const quantityAfter = stockDoc.quantity;
  const quantityBefore = quantityAfter - quantity;

  // Create the movement record
  const movement = await StockMovement.create({
    stock: stockDoc._id,
    product: stockDoc.product,
    branch: stockDoc.branch,
    type,
    quantity,
    quantityBefore,
    quantityAfter,
    reason,
    reference,
    supplier,
    notes,
    performedBy,
  });

  return movement;
}

/**
 * Create movement for stock that was just modified
 * Use this AFTER updating stock quantity
 * 
 * @param {Object} stockDoc - The stock document (after update)
 * @param {Number} oldQuantity - The quantity before the update
 * @param {Object} params - Additional movement params
 * @returns {Promise<Object>} Created movement record
 */
async function createMovementWithOldQuantity(stockDoc, oldQuantity, {
  type,
  reason,
  reference,
  supplier,
  notes,
  performedBy,
}) {
  const quantity = stockDoc.quantity - oldQuantity;

  const movement = await StockMovement.create({
    stock: stockDoc._id,
    product: stockDoc.product,
    branch: stockDoc.branch,
    type,
    quantity,
    quantityBefore: oldQuantity,
    quantityAfter: stockDoc.quantity,
    reason,
    reference,
    supplier,
    notes,
    performedBy,
  });

  return movement;
}

/**
 * Movement type constants for use in controllers
 */
const MOVEMENT_TYPES = {
  RESTOCK: 'restock',
  ADJUSTMENT_ADD: 'adjustment_add',
  ADJUSTMENT_REMOVE: 'adjustment_remove',
  SALE: 'sale',
  SALE_CANCEL: 'sale_cancel',
  SERVICE_USE: 'service_use',
  TRANSFER_OUT: 'transfer_out',
  TRANSFER_IN: 'transfer_in',
  INITIAL: 'initial',
};

module.exports = {
  createMovement,
  createMovementWithOldQuantity,
  MOVEMENT_TYPES,
};
