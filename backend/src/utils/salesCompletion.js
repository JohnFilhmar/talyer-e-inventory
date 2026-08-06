import Stock from '../models/Stock.js';
import Transaction from '../models/Transaction.js';
import { createMovementWithOldQuantity, MOVEMENT_TYPES } from './stockMovement.js';

/**
 * Completing a sales order is the single point where a sale becomes real:
 * stock leaves inventory, the movement ledger records why, and the money is
 * written to the transaction log.
 *
 * It lives here because three paths now reach it — creating an order that is
 * already paid in full, marking an existing order complete, and recording a
 * payment that settles the balance. None of these are Mongoose hooks, so a
 * fourth path that forgets to call this would silently sell stock that the
 * system still believes is on the shelf.
 *
 * The caller is responsible for saving the order afterwards; this mutates the
 * document but does not persist it, so the caller can batch it with its own
 * changes in one save.
 *
 * @param {import('mongoose').Document} order A SalesOrder document.
 * @param {import('mongoose').Document} user  The acting user, for the audit trail.
 * @returns {Promise<boolean>} true if this call performed the completion.
 */
export const completeSalesOrder = async (order, user) => {
  // Idempotency guard. Completing twice would deduct the stock twice and write
  // a second transaction for money that was only received once — and with three
  // callers, a double call is a question of when, not whether.
  if (order.status === 'completed') return false;

  for (const item of order.items) {
    const stock = await Stock.findOne({ product: item.product, branch: order.branch });
    if (!stock) continue;

    const oldQuantity = stock.quantity;
    // deductStock also releases the reservation taken at order creation, so
    // the reserved count does not leak.
    await stock.deductStock(item.quantity);

    await createMovementWithOldQuantity(stock, oldQuantity, {
      type: MOVEMENT_TYPES.SALE,
      reference: { type: 'SalesOrder', id: order._id },
      notes: `Sale order ${order.orderNumber}`,
      performedBy: user._id,
    });
  }

  // Only money actually received is recorded. An order completed while still
  // unpaid (goods released on account) produces no transaction — one is written
  // when the payment lands, by the payment path.
  if (order.payment.status === 'paid') {
    await recordSaleTransaction(order, user);
  }

  order.status = 'completed';
  order.completedAt = new Date();
  return true;
};

/**
 * Writes the cash-flow record for a completed, paid sale.
 *
 * Guarded against duplicates by reference, because the completion path and the
 * payment path can both reach a state where the order is complete and paid —
 * completing an unpaid order and then paying it must not write a second row for
 * the same sale.
 *
 * @param {import('mongoose').Document} order
 * @param {import('mongoose').Document} user
 * @returns {Promise<boolean>} true if a transaction was written.
 */
export const recordSaleTransaction = async (order, user) => {
  const existing = await Transaction.findOne({
    'reference.model': 'SalesOrder',
    'reference.id': order._id,
    type: 'sale',
  });
  if (existing) return false;

  const txnCount = await Transaction.countDocuments();
  const timestamp = Date.now().toString().slice(-6);

  await Transaction.create({
    transactionNumber: `TXN-${String(txnCount + 1).padStart(6, '0')}-${timestamp}`,
    type: 'sale',
    branch: order.branch,
    amount: order.total,
    paymentMethod: order.payment.method,
    reference: { model: 'SalesOrder', id: order._id },
    description: `Sales Order ${order.orderNumber}`,
    processedBy: user._id,
  });

  return true;
};
