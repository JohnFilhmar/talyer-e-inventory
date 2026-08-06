import 'dotenv/config';
import mongoose from 'mongoose';
import Product from '../models/Product.js';

/**
 * One-off migration: `Product.model` → `Product.productModel`.
 *
 * The field was renamed so it could not be confused with `motorcycleModels`,
 * which is what a part *fits* rather than what it *is*. Existing documents
 * still carry the old key; nothing reads it any more, so without this run the
 * manufacturer designation silently disappears from every product that had one.
 *
 * Safe to run more than once — `$rename` only touches documents that still
 * have the old field, and the guard below skips any document that somehow has
 * both (there the new value is authoritative and the stale one is just dropped).
 *
 * Run with: node src/utils/migrateProductModel.js
 */
const migrateProductModel = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Written through the raw collection, not the model: `model` no longer
    // exists in the schema, so Mongoose's strict mode would strip it from any
    // query built through Product.find/updateMany and the migration would
    // match nothing.
    const collection = Product.collection;

    // Documents carrying both keys — a half-applied earlier run, or a write
    // from an old process after a partial deploy. The new field wins.
    const bothResult = await collection.updateMany(
      { model: { $exists: true }, productModel: { $exists: true } },
      { $unset: { model: '' } }
    );

    const renameResult = await collection.updateMany(
      { model: { $exists: true } },
      { $rename: { model: 'productModel' } }
    );

    console.log(`✅ Renamed model → productModel on ${renameResult.modifiedCount} product(s)`);
    if (bothResult.modifiedCount > 0) {
      console.log(
        `   Dropped a stale 'model' from ${bothResult.modifiedCount} product(s) that already had 'productModel'`
      );
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error migrating product model field:', error);
    process.exit(1);
  }
};

migrateProductModel();
