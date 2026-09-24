/**
 * Deterministic fixed-point decimal arithmetic for money, quantities and rates.
 *
 * Values are held as BigInt scaled by 10^6 (six decimal places). Nothing here
 * ever uses binary floating point for arithmetic, so totals are reproducible:
 * 0.1 + 0.2 is exactly 0.3 and 1000 × 18% is exactly 180.
 *
 * Rounding is "half away from zero" (commercial rounding), e.g. 2.345 → 2.35.
 */

const SCALE = 6;
const FACTOR = 10n ** BigInt(SCALE);

/** @typedef {bigint} Dec  A decimal scaled by 10^6. */

/**
 * Parse a string, number or Dec into a Dec. Invalid input becomes 0.
 * @param {string|number|bigint|null|undefined} value
 * @returns {Dec}
 */
export function dec(value) {
  if (typeof value === 'bigint') return value;
  if (value === null || value === undefined || value === '') return 0n;
  let text;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0n;
    text = value.toFixed(SCALE + 2);
  } else {
    text = String(value).trim().replace(/,/g, '');
  }
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(text);
  if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) return 0n;
  const negative = m[1] === '-';
  const intPart = m[2] || '0';
  const fracRaw = m[3] || '';
  const frac = (fracRaw + '0'.repeat(SCALE + 1)).slice(0, SCALE + 1);
  let scaled = BigInt(intPart) * FACTOR + BigInt(frac.slice(0, SCALE));
  if (Number(frac[SCALE]) >= 5) scaled += 1n;
  return negative ? -scaled : scaled;
}

/** Divide with half-away-from-zero rounding. */
function divRound(n, d) {
  if (d === 0n) return 0n;
  const negative = (n < 0n) !== (d < 0n);
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  let q = an / ad;
  if ((an % ad) * 2n >= ad) q += 1n;
  return negative ? -q : q;
}

export const add = (a, b) => dec(a) + dec(b);
export const sub = (a, b) => dec(a) - dec(b);
export const mul = (a, b) => divRound(dec(a) * dec(b), FACTOR);
export const div = (a, b) => divRound(dec(a) * FACTOR, dec(b));
export const neg = (a) => -dec(a);
export const abs = (a) => (dec(a) < 0n ? -dec(a) : dec(a));
export const cmp = (a, b) => (dec(a) === dec(b) ? 0 : dec(a) > dec(b) ? 1 : -1);
export const isZero = (a) => dec(a) === 0n;
export const min = (a, b) => (dec(a) < dec(b) ? dec(a) : dec(b));
export const max = (a, b) => (dec(a) > dec(b) ? dec(a) : dec(b));

/** @param {Array<string|number|bigint>} values */
export const sum = (values) => values.reduce((acc, v) => acc + dec(v), 0n);

/** `rate` percent of `amount`, e.g. percentOf('1000', '18') → 180. */
export const percentOf = (amount, rate) => divRound(dec(amount) * dec(rate), FACTOR * 100n);

/**
 * Round to `dp` decimal places (0–6).
 * @returns {Dec}
 */
export function round(value, dp = 2) {
  const places = Math.max(0, Math.min(SCALE, dp | 0));
  const unit = 10n ** BigInt(SCALE - places);
  return divRound(dec(value), unit) * unit;
}

/**
 * Exact decimal string with exactly `dp` decimals (rounded), e.g. '1180.00'.
 * @returns {string}
 */
export function toFixed(value, dp = 2) {
  const places = Math.max(0, Math.min(SCALE, dp | 0));
  const r = round(value, places);
  const negative = r < 0n;
  const a = negative ? -r : r;
  const int = (a / FACTOR).toString();
  const frac = (a % FACTOR).toString().padStart(SCALE, '0').slice(0, places);
  const body = places > 0 ? `${int}.${frac}` : int;
  return negative && r !== 0n ? `-${body}` : body;
}

/** Shortest exact string (no trailing zeros), e.g. '2.5', '12'. */
export function toPlain(value) {
  const s = toFixed(value, SCALE);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** True if the input is a syntactically valid decimal. */
export function isValidDecimal(value) {
  if (value === null || value === undefined) return false;
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(String(value).trim().replace(/,/g, ''));
}

export const ZERO = 0n;
