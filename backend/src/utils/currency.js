/**
 * Money rounding.
 *
 * Every monetary field in this system is a double, and doubles cannot represent
 * most centavo amounts. Three units at PHP 8.10 multiply out to
 * 24.299999999999997, and at 12% VAT the order total lands on
 * 27.215999999999998. Nothing here is cosmetic: that number feeds the `>=` that
 * decides `payment.status`, so a cashier tendering the 27.22 shown on the screen
 * is `paid` while one tendering the exact stored value is `partial` and the
 * order silently refuses to complete. A full-value line discount is worse: it
 * produces a total of about -3.55e-15, which trips the schema's `min: 0` and
 * rejects the sale with a message describing nothing the operator did.
 *
 * Rounding at the point of assignment fixes the stored value, which is what the
 * comparisons and the ledger read. Storing integer centavos throughout would
 * remove the class of error rather than the instances, but it changes every
 * stored amount, every API response and every frontend formatter, and needs a
 * migration. That is recorded on GAP-041 as the eventual fix.
 */

const DECIMALS = 2;

/**
 * Shift a number by a power of ten through its decimal string form.
 *
 * `value * 100` reintroduces the binary error this helper exists to remove:
 * 1.005 * 100 is 100.49999999999999, which rounds down to the wrong centavo.
 * Rewriting the exponent instead is exact, and going through `toExponential`
 * rather than string concatenation keeps it correct for values that are already
 * written in exponential notation. `${-3.55e-15}e2` is `NaN`.
 *
 * @param {number} value
 * @param {number} exponent
 * @returns {number}
 */
const shift = (value, exponent) => {
  const [mantissa, e] = value.toExponential().split('e');
  return Number(`${mantissa}e${Number(e) + exponent}`);
};

/**
 * Round to centavos, half away from zero.
 *
 * Half-up is the retail convention and is what a printed receipt and a cashier
 * expect. Banker's rounding is used in some accounting contexts and would be a
 * one-line change here; GAP-041 records the choice as one for the owner's
 * bookkeeper to confirm.
 *
 * `Math.round` alone is half toward positive infinity, so -0.005 would round to
 * -0.00 while 0.005 rounds to 0.01. Money should be symmetric about zero.
 *
 * A non-finite input returns 0 rather than propagating `NaN` into a stored
 * amount. A `NaN` total compares false against every threshold, so it would
 * leave an order permanently neither paid nor unpaid.
 *
 * @param {number} value
 * @returns {number}
 */
export const roundCurrency = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;

  const scaled = shift(amount, DECIMALS);
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);

  // `+ 0` normalises -0, which is what a rounded negative epsilon produces.
  // Storing it is harmless arithmetically and confusing in every report.
  return shift(rounded, -DECIMALS) + 0;
};

/**
 * Sum monetary values, rounding the result.
 *
 * Accumulating raw doubles and rounding once at the end is deliberate: rounding
 * each addend first would let a half-centavo bias compound across a long
 * receipt.
 *
 * @param {number[]} values
 * @returns {number}
 */
export const sumCurrency = (values) =>
  roundCurrency(values.reduce((total, value) => total + Number(value || 0), 0));
