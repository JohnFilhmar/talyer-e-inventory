import mongoose from 'mongoose';

/**
 * A motorcycle a product can fit. Products reference these many-to-many
 * (`Product.motorcycleModels`), the way tags work, so one part can be listed
 * as fitting a Click 125i, a Click 150i and a PCX without being duplicated.
 *
 * Deliberately flat rather than hierarchical like Category: a shop asks "does
 * this fit a Click 125i?", never "what is the parent of a Click 125i?".
 */
const motorcycleModelSchema = new mongoose.Schema(
  {
    make: {
      type: String,
      required: [true, 'Make is required'],
      trim: true,
      maxlength: [100, 'Make cannot exceed 100 characters']
    },
    model: {
      type: String,
      required: [true, 'Model is required'],
      trim: true,
      maxlength: [100, 'Model cannot exceed 100 characters']
    },
    // A year range, not a single year: the same model is sold unchanged for
    // several years, and a part that fits the 2018 Click fits the 2019 one.
    // Both ends are optional — an open-ended range means "all years".
    yearFrom: {
      type: Number,
      min: [1900, 'Year from cannot be earlier than 1900'],
      max: [2200, 'Year from cannot be later than 2200']
    },
    yearTo: {
      type: Number,
      min: [1900, 'Year to cannot be earlier than 1900'],
      max: [2200, 'Year to cannot be later than 2200'],
      validate: {
        validator: function (value) {
          if (value === undefined || value === null) return true;
          if (this.yearFrom === undefined || this.yearFrom === null) return true;
          return value >= this.yearFrom;
        },
        message: 'Year to must be greater than or equal to year from'
      }
    },
    // Derived from make/model/years and kept unique — this is what stops
    // "Honda Click 125i" being entered twice with different capitalisation.
    // Regenerated on every save whose inputs changed (see the hook below).
    code: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [220, 'Code cannot exceed 220 characters']
    },
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes
// Note: code already has unique: true, which auto-creates its index.
motorcycleModelSchema.index({ make: 1, model: 1 });
motorcycleModelSchema.index({ isActive: 1 });

/**
 * The stable identity of a motorcycle model: make + model + year range,
 * uppercased and punctuation-collapsed. Exposed as a static so the controller
 * can rebuild it on update without duplicating the rule.
 */
motorcycleModelSchema.statics.buildCode = function ({ make, model, yearFrom, yearTo }) {
  const parts = [make, model, yearFrom, yearTo]
    .filter((part) => part !== undefined && part !== null && String(part).trim() !== '')
    .join('-');

  return parts
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

/**
 * Human-readable label, e.g. "Honda Click 125i (2018-2023)". The single place
 * this string is composed — the frontend renders this field rather than
 * re-assembling make/model/years in every list, chip and dropdown.
 */
motorcycleModelSchema.virtual('displayName').get(function () {
  const base = [this.make, this.model].filter(Boolean).join(' ');

  if (this.yearFrom && this.yearTo) {
    return this.yearFrom === this.yearTo
      ? `${base} (${this.yearFrom})`
      : `${base} (${this.yearFrom}-${this.yearTo})`;
  }
  if (this.yearFrom) return `${base} (${this.yearFrom}+)`;
  if (this.yearTo) return `${base} (up to ${this.yearTo})`;

  return base;
});

// How many products are listed as fitting this motorcycle. Used by the
// management page and by the delete guard's error message.
motorcycleModelSchema.virtual('productCount', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'motorcycleModels',
  count: true
});

// The code is derived, so it is rebuilt whenever any of its inputs change —
// unlike Category.code, which is only filled in when absent. Renaming a
// motorcycle model here has to move its identity with it, or the old code
// would keep blocking a legitimate re-entry of the new name.
motorcycleModelSchema.pre('save', function (next) {
  const inputsChanged =
    this.isModified('make') ||
    this.isModified('model') ||
    this.isModified('yearFrom') ||
    this.isModified('yearTo');

  if (!this.code || inputsChanged) {
    this.code = this.constructor.buildCode({
      make: this.make,
      model: this.model,
      yearFrom: this.yearFrom,
      yearTo: this.yearTo
    });
  }

  next();
});

const MotorcycleModel = mongoose.model('MotorcycleModel', motorcycleModelSchema);

export default MotorcycleModel;
