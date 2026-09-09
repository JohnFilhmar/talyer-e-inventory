import Counter from '../models/Counter.js';

// Atomic identifier allocation.
//
// Every human-readable id in this system used to be built from
// `countDocuments() + 1`. Two creates in the same moment read the same count,
// build the same string, and the second one loses on the unique index. On the
// offline path that is worse than an error: `sync.ts` treats a 4xx as permanent
// and discards the queued order, so a numbering collision destroys a real sale.
// Counting also made a hard delete hand the retired number to the next create.
//
// `findOneAndUpdate` with `$inc` and `upsert` is atomic on a single document,
// including on a standalone server, so it needs no transaction. That matters
// here: production MongoDB is standalone and has no multi-document transactions.

const DUPLICATE_KEY = 11000;

/**
 * Read the highest numeric suffix already issued under a prefix.
 *
 * Every id is `<prefix><zero-padded number>` with a fixed width, so the
 * lexicographic maximum is also the numeric maximum and one indexed descending
 * read answers it. Ids that do not parse are ignored rather than assumed to be
 * zero, so a hand-entered SKU cannot drag a sequence backwards.
 *
 * @param {import('mongoose').Model} model
 * @param {string} field
 * @param {string} prefix
 * @returns {Promise<number>} the highest suffix, or 0 when none exist
 */
export const highestSuffix = async (model, field, prefix) => {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const latest = await model
    .findOne({ [field]: { $regex: `^${escaped}` } })
    .sort({ [field]: -1 })
    .select(field)
    .lean();

  if (!latest || !latest[field]) return 0;
  const suffix = String(latest[field]).slice(prefix.length);
  const parsed = Number.parseInt(suffix, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/**
 * Allocate the next number in a sequence.
 *
 * @param {string} key sequence id, period included: `salesOrder:2026`
 * @param {() => Promise<number>} [seed] highest number already issued outside
 *   the counter, consulted only when this key has no counter document yet
 * @returns {Promise<number>}
 */
export const nextSequence = async (key, seed) => {
  // First use of a key has to account for ids that predate this counter, or the
  // sequence restarts at 1 and every allocation collides with an existing
  // document until it climbs past them. Seeding is a separate insert rather than
  // part of the increment because `$inc` and `$setOnInsert` cannot both touch
  // `seq` in one update: Mongo rejects that as a conflict.
  //
  // Two callers can reach this at once. `updateOne` with `upsert` makes exactly
  // one of them insert; the loser gets a duplicate key on `_id`, which is the
  // correct outcome and is swallowed. Neither has incremented yet, so no number
  // is skipped or shared.
  if (seed) {
    const existing = await Counter.exists({ _id: key });
    if (!existing) {
      const start = await seed();
      if (start > 0) {
        try {
          await Counter.updateOne(
            { _id: key },
            { $setOnInsert: { seq: start } },
            { upsert: true }
          );
        } catch (error) {
          if (error?.code !== DUPLICATE_KEY) throw error;
        }
      }
    }
  }

  // An upsert can also lose this race, on the same unique `_id`. Retrying once
  // is enough: the document exists by then, so the second attempt is a plain
  // update that cannot conflict.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        // `returnDocument: 'after'` rather than `new: true`: mongoose 9
        // deprecates the latter and warns once per call, which on a hot
        // allocator is a warning per identifier issued.
        { returnDocument: 'after', upsert: true }
      );
      return counter.seq;
    } catch (error) {
      if (error?.code !== DUPLICATE_KEY || attempt === 1) throw error;
    }
  }

  // Unreachable: the loop either returns or throws.
  throw new Error(`Could not allocate a number for sequence ${key}`);
};

/**
 * Allocate and format in one call, which is what every caller actually wants.
 *
 * @param {object} options
 * @param {string} options.key sequence id, period included
 * @param {string} options.prefix the literal text before the number
 * @param {number} [options.width] zero-padded width, default 6
 * @param {() => Promise<number>} [options.seed]
 * @returns {Promise<string>}
 */
export const nextIdentifier = async ({ key, prefix, width = 6, seed }) => {
  const seq = await nextSequence(key, seed);
  return `${prefix}${String(seq).padStart(width, '0')}`;
};

/**
 * The period segment the `SO-YYYY-` style prefixes advertise.
 *
 * @param {Date} [now]
 */
export const yearKey = (now = new Date()) => String(now.getFullYear());

/**
 * The period segment `TXN-YYYYMM-` advertises.
 *
 * @param {Date} [now]
 */
export const monthKey = (now = new Date()) =>
  `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
