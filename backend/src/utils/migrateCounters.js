import 'dotenv/config';
import path from 'path';
import { pathToFileURL } from 'url';
import mongoose from 'mongoose';

import Counter from '../models/Counter.js';
import Product from '../models/Product.js';
import SalesOrder from '../models/SalesOrder.js';
import ServiceOrder from '../models/ServiceOrder.js';
import StockMovement from '../models/StockMovement.js';
import StockTransfer from '../models/StockTransfer.js';
import Transaction from '../models/Transaction.js';

/**
 * Seed the `Counter` collection from the identifiers already in the database.
 *
 * `nextSequence` seeds a counter lazily the first time it allocates for a key,
 * so a database that never runs this script still issues correct numbers. This
 * exists to do that work up front, where it can be read before it matters,
 * rather than inside the first sale of the year.
 *
 * Reporting is the default. `--apply` writes, and a write only ever RAISES a
 * counter: lowering one would hand out numbers that already exist. Running it
 * twice is a no-op.
 */

// prefix + optional period + a fixed-width number. The width is what lets a
// lexicographic max double as a numeric max.
const SEQUENCES = [
  { name: 'salesOrder', model: SalesOrder, field: 'orderNumber', prefix: 'SO-', periodLength: 4 },
  { name: 'serviceOrder', model: ServiceOrder, field: 'jobNumber', prefix: 'JOB-', periodLength: 4 },
  { name: 'stockTransfer', model: StockTransfer, field: 'transferNumber', prefix: 'TR-', periodLength: 4 },
  { name: 'stockMovement', model: StockMovement, field: 'movementId', prefix: 'SM-', periodLength: 4 },
  { name: 'transaction', model: Transaction, field: 'transactionNumber', prefix: 'TXN-', periodLength: 6 },
  { name: 'product', model: Product, field: 'sku', prefix: 'PROD-', periodLength: 0 },
];

const WIDTH = 6;

const patternFor = ({ prefix, periodLength }) => {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const period = periodLength ? `\\d{${periodLength}}-` : '';
  return `^${escaped}${period}\\d{${WIDTH}}$`;
};

/**
 * Highest number issued per period, read straight from the existing documents.
 *
 * @param {(typeof SEQUENCES)[number]} sequence
 * @returns {Promise<Array<{ key: string, highest: number }>>}
 */
export const survey = async (sequence) => {
  const { name, model, field, prefix, periodLength } = sequence;
  const rows = await model.aggregate([
    { $match: { [field]: { $regex: patternFor(sequence) } } },
    {
      $group: {
        _id: periodLength
          ? { $substrCP: [`$${field}`, prefix.length, periodLength] }
          : null,
        highest: { $max: `$${field}` },
      },
    },
  ]);

  return rows
    .map((row) => {
      const suffix = String(row.highest).slice(-WIDTH);
      const highest = Number.parseInt(suffix, 10);
      return {
        key: row._id ? `${name}:${row._id}` : name,
        highest: Number.isFinite(highest) ? highest : 0,
      };
    })
    .filter((row) => row.highest > 0)
    .sort((a, b) => a.key.localeCompare(b.key));
};

/**
 * @param {{ apply?: boolean, log?: (...args: unknown[]) => void }} options
 */
export const migrateCounters = async ({ apply = false, log = console.log } = {}) => {
  const planned = [];

  for (const sequence of SEQUENCES) {
    for (const { key, highest } of await survey(sequence)) {
      const counter = await Counter.findById(key).lean();
      const current = counter ? counter.seq : null;

      if (current !== null && current >= highest) {
        log(`  ok      ${key}: counter ${current} already at or above ${highest}`);
        continue;
      }

      planned.push({ key, from: current, to: highest });
      log(
        `  ${apply ? 'raise ' : 'would '} ${key}: ${current === null ? 'no counter' : current} -> ${highest}`
      );

      if (apply) {
        await Counter.updateOne({ _id: key }, { $set: { seq: highest } }, { upsert: true });
      }
    }
  }

  if (planned.length === 0) {
    log('Every counter is already at or above the highest identifier issued.');
  } else if (!apply) {
    log(`\n${planned.length} counter(s) would change. Re-run with --apply to write them.`);
  } else {
    log(`\n${planned.length} counter(s) written.`);
  }

  return planned;
};

const isEntryPoint = () => {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return import.meta.url === pathToFileURL(path.resolve(invoked)).href;
};

// Importing this module must do nothing. Everything below runs only when the
// file is the process entry point.
if (isEntryPoint()) {
  const run = async () => {
    const apply = process.argv.includes('--apply');
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      console.error('MONGODB_URI is not set.');
      process.exit(1);
    }

    // Printed with credentials stripped, so a run against the wrong database is
    // visible in the output rather than only in its effects. There is no
    // production guard here, unlike reconcileReservations: this write only ever
    // raises a counter to a number that has already been issued, and production
    // is exactly where it needs to run.
    console.log('Target database:', uri.replace(/\/\/[^@]+@/, '//<redacted>@'));
    console.log(apply ? 'Mode: apply' : 'Mode: report only');

    try {
      await mongoose.connect(uri);
      await migrateCounters({ apply });
      await mongoose.connection.close();
      process.exit(0);
    } catch (error) {
      console.error('Counter migration failed:', error);
      process.exit(1);
    }
  };

  run();
}
