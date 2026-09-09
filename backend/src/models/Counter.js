import mongoose from 'mongoose';

// One document per identifier sequence. The `_id` is the sequence key, which
// carries its own period: `salesOrder:2026`, `transaction:202609`, or a bare
// `product` for a sequence that never resets. Keying the period into the id is
// what makes `findOneAndUpdate` with `$inc` a complete allocator: the counter a
// caller increments is already the right one for the period, so no read, no
// comparison, and no second write are involved.
//
// There is no `createdAt`/`updatedAt` and no version key on purpose. Every write
// to this collection is a single `$inc` on a hot document, and neither field
// would ever be read.
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false }
);

const Counter = mongoose.model('Counter', counterSchema);

export default Counter;
