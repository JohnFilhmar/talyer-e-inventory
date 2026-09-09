import 'dotenv/config';
import path from 'path';
import { pathToFileURL } from 'url';
import mongoose from 'mongoose';
import Stock from '../models/Stock.js';
import SalesOrder from '../models/SalesOrder.js';
import StockTransfer from '../models/StockTransfer.js';

/**
 * Reports Stock rows whose `reservedQuantity` exceeds what open orders and
 * transfers actually account for.
 *
 * GAP-014 stopped new leaks; it repaired nothing. Every order-creation request
 * that failed after its first reservation, for the whole life of the codebase
 * before that fix, left `reservedQuantity` incremented on rows whose order was
 * never created. `Stock.availableQuantity` is `quantity - reservedQuantity` and
 * no endpoint releases an orphan, so those units are invisible to the New Sale
 * picker and to every availability check: a product reads "out of stock" while
 * the shelf is full.
 *
 * Reporting is the default because the correct repair is a judgement call. A
 * discrepancy can also mean a genuinely stuck order that a human should look at
 * rather than silently zero out.
 */

/** Sales order statuses that still hold a reservation. */
const OPEN_ORDER_STATUSES = ['pending', 'processing'];

/** Transfer statuses that still hold a reservation at the source branch. */
const OPEN_TRANSFER_STATUSES = ['pending', 'in-transit'];

const keyOf = (productId, branchId) => `${String(productId)}:${String(branchId)}`;

/**
 * Sum the reservations that open records justify, per (product, branch).
 *
 * Service orders are deliberately absent: they deduct parts at completion
 * rather than reserving at creation, so on the current code they hold no
 * reservation. That reading should be confirmed against real data before this
 * script is trusted to call a row over-reserved.
 *
 * @returns {Promise<Map<string, number>>}
 */
const expectedReservations = async () => {
  const expected = new Map();

  const orders = await SalesOrder.find({ status: { $in: OPEN_ORDER_STATUSES } })
    .select('branch items')
    .lean();

  for (const order of orders) {
    for (const item of order.items || []) {
      const key = keyOf(item.product, order.branch);
      expected.set(key, (expected.get(key) || 0) + (item.quantity || 0));
    }
  }

  const transfers = await StockTransfer.find({ status: { $in: OPEN_TRANSFER_STATUSES } })
    .select('product fromBranch quantity')
    .lean();

  for (const transfer of transfers) {
    const key = keyOf(transfer.product, transfer.fromBranch);
    expected.set(key, (expected.get(key) || 0) + (transfer.quantity || 0));
  }

  return expected;
};

/**
 * Compare every Stock row against the reservations open records justify.
 *
 * Reads only. Rows where the stored value is *lower* than expected are reported
 * too: that is the opposite problem and equally worth a human's attention, but
 * `apply` never raises a reservation.
 *
 * @returns {Promise<Array<{stockId, product, branch, stored, expected, difference}>>}
 */
export const reconcile = async () => {
  const expected = await expectedReservations();

  const rows = await Stock.find({})
    .select('product branch quantity reservedQuantity')
    .lean();

  const discrepancies = [];
  for (const row of rows) {
    const want = expected.get(keyOf(row.product, row.branch)) || 0;
    const stored = row.reservedQuantity || 0;
    if (stored === want) continue;

    discrepancies.push({
      stockId: row._id,
      product: row.product,
      branch: row.branch,
      quantity: row.quantity,
      stored,
      expected: want,
      difference: stored - want,
    });
  }

  return discrepancies;
};

/**
 * Lower an over-reservation to what open records justify.
 *
 * Only ever reduces. A row reserving less than expected is left alone and
 * reported: raising a reservation could make stock unsellable on the strength
 * of a script's inference.
 *
 * @param {Array} discrepancies from reconcile()
 * @returns {Promise<number>} rows corrected
 */
export const applyCorrections = async (discrepancies) => {
  let corrected = 0;

  for (const row of discrepancies) {
    if (row.difference <= 0) continue;

    const stock = await Stock.findById(row.stockId);
    if (!stock) continue;

    stock.reservedQuantity = row.expected;
    await stock.save();
    corrected += 1;
  }

  return corrected;
};

const describeTarget = (uri) => {
  if (!uri) return '(MONGODB_URI is not set)';
  try {
    const parsed = new URL(uri);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return '(unparseable MONGODB_URI)';
  }
};

const isEntryPoint = () => {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return import.meta.url === pathToFileURL(path.resolve(invoked)).href;
};

const report = (discrepancies) => {
  if (discrepancies.length === 0) {
    console.log('No discrepancies: every reservation matches its open records.');
    return;
  }

  console.log(`${discrepancies.length} row(s) with a reservation mismatch:`);
  console.log('');
  for (const row of discrepancies) {
    const direction = row.difference > 0 ? 'over' : 'under';
    console.log(
      `  stock=${row.stockId} product=${row.product} branch=${row.branch}\n` +
        `    quantity=${row.quantity} reserved=${row.stored} expected=${row.expected} ` +
        `(${direction} by ${Math.abs(row.difference)})`
    );
  }
  console.log('');
  console.log('Re-run with --apply --confirm to lower the over-reserved rows.');
  console.log('Rows reserving less than expected are reported but never raised.');
};

// Same guard shape as seedBranches.js: importing this module must do nothing,
// and the write path needs an explicit opt-in plus a production override.
if (isEntryPoint()) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const confirmed = args.includes('--confirm');
  const forcedProduction = args.includes('--force-production');

  const run = async () => {
    if (apply && !confirmed) {
      console.error('Refusing to write without --confirm.');
      console.error('  node src/utils/reconcileReservations.js --apply --confirm');
      console.error('Target database:', describeTarget(process.env.MONGODB_URI));
      process.exit(1);
    }

    if (apply && process.env.NODE_ENV === 'production' && !forcedProduction) {
      console.error('Refusing to write against NODE_ENV=production without --force-production.');
      console.error('Target database:', describeTarget(process.env.MONGODB_URI));
      process.exit(1);
    }

    console.log('Target database:', describeTarget(process.env.MONGODB_URI));

    try {
      await mongoose.connect(process.env.MONGODB_URI);
      const discrepancies = await reconcile();
      report(discrepancies);

      if (apply) {
        const corrected = await applyCorrections(discrepancies);
        console.log(`Lowered ${corrected} over-reserved row(s).`);
      }

      await mongoose.connection.close();
      process.exit(0);
    } catch (error) {
      console.error('Reconciliation failed:', error);
      process.exit(1);
    }
  };

  run();
}

export { OPEN_ORDER_STATUSES, OPEN_TRANSFER_STATUSES };
