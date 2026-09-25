import Stock from '../models/Stock.js';
import Transaction from '../models/Transaction.js';
import { roundCurrency, sumCurrency } from './currency.js';
import { createMovementWithOldQuantity, MOVEMENT_TYPES } from './stockMovement.js';

/** What happens to a returned item: back on the shelf, or written off. */
export const REFUND_DISPOSITIONS = ['sellable', 'discarded'];

const refusal = (message) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * Refund some or all of a completed, paid sales order (GAP-050).
 *
 * The amount is computed here, never taken from the caller. Each line is
 * refunded at its share of what the customer actually paid: the line's unit
 * price after its own discount, scaled by the order's total over its subtotal,
 * which carries the order's VAT and order-level discount on whichever basis the
 * order was written with. A refund that returns everything still unrefunded
 * takes the exact remainder instead, so rounding never strands a centavo.
 *
 * Sellable items go back into the branch's stock with a `sale_return` movement;
 * discarded ones are recorded on the refund and touch no stock. Every refund
 * writes a `refund` transaction against the branch that made the sale.
 *
 * The order is saved first, with a forced version check, so two refunds racing
 * on one order cannot both claim the same units: the loser fails with a
 * VersionError before it has returned any stock or written any money.
 * ponytail: the stock and ledger writes after that save are not atomic with it;
 * GAP-046's code half moves this into a transaction.
 *
 * @param {import('mongoose').Document} order a hydrated SalesOrder
 * @param {{ items: Array<{ itemId: string, quantity: number, disposition: string }>, reason?: string }} request
 * @param {{ _id: unknown }} user
 * @returns {Promise<object>} the refund entry that was recorded
 */
export const refundSalesOrder = async (order, { items, reason }, user) => {
  if (order.status !== 'completed') {
    throw refusal('Only completed orders can be refunded');
  }
  if (!['paid', 'refunded'].includes(order.payment.status) || order.refundStatus === 'full') {
    throw refusal(
      order.refundStatus === 'full'
        ? 'This order has already been fully refunded'
        : 'Only paid orders can be refunded; record the payment first'
    );
  }

  const alreadyReturned = new Map();
  for (const refund of order.refunds) {
    for (const line of refund.items) {
      const key = String(line.item);
      alreadyReturned.set(key, (alreadyReturned.get(key) || 0) + line.quantity);
    }
  }

  const factor = order.subtotal > 0 ? order.total / order.subtotal : 0;
  const lines = [];
  const requested = new Map();

  for (const { itemId, quantity, disposition } of items) {
    const item = order.items.id(itemId);
    if (!item) throw refusal(`Item ${itemId} is not on this order`);

    const key = String(item._id);
    const total = (requested.get(key) || 0) + quantity;
    const remaining = item.quantity - (alreadyReturned.get(key) || 0);
    if (total > remaining) {
      throw refusal(`Only ${remaining} of ${item.name} can still be refunded`);
    }
    requested.set(key, total);

    lines.push({
      item: item._id,
      product: item.product,
      name: item.name,
      quantity,
      disposition,
      amount: roundCurrency((item.total / item.quantity) * quantity * factor),
    });
  }

  const everythingReturned = order.items.every(
    (item) => (alreadyReturned.get(String(item._id)) || 0) + (requested.get(String(item._id)) || 0) >= item.quantity
  );
  const remainder = roundCurrency(order.total - (order.refundedAmount || 0));
  const amount = everythingReturned ? remainder : Math.min(sumCurrency(lines.map((l) => l.amount)), remainder);

  // Resolve every stock row before anything is written, so a missing one is a
  // clean 400 rather than a half-applied refund.
  const restock = [];
  for (const line of lines.filter((l) => l.disposition === 'sellable')) {
    const stock = await Stock.findOne({ product: line.product, branch: order.branch });
    if (!stock) throw refusal(`${line.name} has no stock record at this branch to return it to`);
    restock.push({ stock, line });
  }

  order.refunds.push({ items: lines, amount, reason, processedBy: user._id });
  order.refundedAmount = roundCurrency((order.refundedAmount || 0) + amount);
  order.refundStatus = everythingReturned ? 'full' : 'partial';
  order.increment();
  await order.save();
  const entry = order.refunds[order.refunds.length - 1];

  for (const { stock, line } of restock) {
    const oldQuantity = stock.quantity;
    stock.quantity += line.quantity;
    await stock.save();
    await createMovementWithOldQuantity(stock, oldQuantity, {
      type: MOVEMENT_TYPES.SALE_RETURN,
      reference: { type: 'SalesOrder', id: order._id },
      notes: `Refund on ${order.orderNumber}`,
      performedBy: user._id,
    });
  }

  await Transaction.create({
    type: 'refund',
    branch: order.branch,
    amount,
    paymentMethod: order.payment.method,
    reference: { model: 'SalesOrder', id: order._id },
    description: `Refund on ${order.orderNumber}${reason ? `: ${reason}` : ''}`.slice(0, 500),
    processedBy: user._id,
  });

  return entry;
};
