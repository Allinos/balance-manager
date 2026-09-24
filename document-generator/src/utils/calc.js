/**
 * Document financial calculations built on the deterministic decimal engine.
 *
 *   Gross line amount = Quantity × Unit price
 *   Taxable amount    = Gross − Discount
 *   Tax               = Taxable × Tax rate / 100
 *                       (INTRA: CGST = SGST = Taxable × rate/2 / 100 each)
 *   Line total        = Taxable + Tax
 *
 *   Grand total = Subtotal − Discount + Tax + Shipping + Other charges ± Round off
 */

import { dec, mul, sub, add, sum, percentOf, round, toFixed, div, min, max, isZero, toPlain } from './decimal.js';

/** Tax modes stored on a document. */
export const TAX_MODES = {
  INTRA: 'INTRA', // CGST + SGST (same state)
  INTER: 'INTER', // IGST (different state)
  SIMPLE: 'SIMPLE', // single tax such as VAT / Sales tax
  NONE: 'NONE', // no tax
};

/**
 * @typedef {Object} LineInput
 * @property {string} quantity
 * @property {string} unit_price
 * @property {string} [discount_value]
 * @property {'PERCENT'|'AMOUNT'} [discount_type]
 * @property {string} [tax_rate]
 */

/**
 * Calculate one item row. All returned amounts are exact decimal strings.
 * @param {LineInput} item
 * @param {{taxMode?: string, decimals?: number}} opts
 */
export function calcLine(item, { taxMode = TAX_MODES.INTRA, decimals = 2 } = {}) {
  const gross = round(mul(item.quantity, item.unit_price), decimals);
  const discountValue = max(dec(item.discount_value), 0n);
  let discount =
    item.discount_type === 'AMOUNT'
      ? round(discountValue, decimals)
      : round(percentOf(gross, min(discountValue, dec('100'))), decimals);
  // A discount can never exceed the gross amount of a positive line.
  if (gross >= 0n) discount = min(discount, gross);
  const taxable = gross - discount;
  const rate = taxMode === TAX_MODES.NONE ? 0n : max(dec(item.tax_rate), 0n);

  let cgst = 0n;
  let sgst = 0n;
  let igst = 0n;
  let tax = 0n;
  if (taxMode === TAX_MODES.INTRA) {
    const half = div(rate, 2);
    cgst = round(percentOf(taxable, half), decimals);
    sgst = cgst;
    tax = cgst + sgst;
  } else if (taxMode === TAX_MODES.INTER) {
    igst = round(percentOf(taxable, rate), decimals);
    tax = igst;
  } else if (taxMode === TAX_MODES.SIMPLE) {
    tax = round(percentOf(taxable, rate), decimals);
  }
  const total = taxable + tax;
  const f = (v) => toFixed(v, decimals);
  return {
    gross_amount: f(gross),
    discount_amount: f(discount),
    taxable_amount: f(taxable),
    tax_rate: toPlain(rate),
    cgst_amount: f(cgst),
    sgst_amount: f(sgst),
    igst_amount: f(igst),
    tax_amount: f(tax),
    total_amount: f(total),
  };
}

/**
 * Calculate every line, the tax breakdown per rate and the document totals.
 * @param {Object} doc  document fields (tax_mode, shipping, other_charges, round_off, meta)
 * @param {LineInput[]} items
 * @param {{decimals?: number, roundOffMode?: 'AUTO'|'MANUAL'|'NONE', includeTax?: boolean}} opts
 */
export function calcDocument(doc, items, { decimals = 2, roundOffMode = 'AUTO', includeTax = true } = {}) {
  const taxMode = includeTax ? doc.tax_mode || TAX_MODES.INTRA : TAX_MODES.NONE;
  const lines = items.map((it) => ({ ...it, ...calcLine(it, { taxMode, decimals }) }));

  const subtotal = sum(lines.map((l) => l.gross_amount));
  const discount = sum(lines.map((l) => l.discount_amount));
  const taxable = sum(lines.map((l) => l.taxable_amount));
  const cgst = sum(lines.map((l) => l.cgst_amount));
  const sgst = sum(lines.map((l) => l.sgst_amount));
  const igst = sum(lines.map((l) => l.igst_amount));
  const tax = sum(lines.map((l) => l.tax_amount));
  const shipping = round(doc.shipping, decimals);
  const other = round(doc.other_charges, decimals);
  const beforeRound = taxable + tax + shipping + other;

  let roundOff = 0n;
  if (roundOffMode === 'AUTO') roundOff = round(beforeRound, 0) - beforeRound;
  else if (roundOffMode === 'MANUAL') roundOff = round(doc.round_off, decimals);
  const grand = beforeRound + roundOff;

  // Tax breakdown grouped by rate (used for the GST summary table).
  const groups = new Map();
  if (taxMode !== TAX_MODES.NONE) {
    for (const l of lines) {
      const key = l.tax_rate;
      const g = groups.get(key) || { tax_rate: key, taxable: 0n, cgst: 0n, sgst: 0n, igst: 0n, tax: 0n };
      g.taxable += dec(l.taxable_amount);
      g.cgst += dec(l.cgst_amount);
      g.sgst += dec(l.sgst_amount);
      g.igst += dec(l.igst_amount);
      g.tax += dec(l.tax_amount);
      groups.set(key, g);
    }
  }
  const f = (v) => toFixed(v, decimals);
  const taxes = [...groups.values()]
    .filter((g) => !isZero(g.taxable) || !isZero(g.tax))
    .sort((a, b) => (dec(a.tax_rate) < dec(b.tax_rate) ? -1 : 1))
    .map((g) => ({
      tax_rate: g.tax_rate,
      taxable_amount: f(g.taxable),
      cgst: f(g.cgst),
      sgst: f(g.sgst),
      igst: f(g.igst),
      tax_amount: f(g.tax),
    }));

  return {
    lines,
    taxes,
    totals: {
      subtotal: f(subtotal),
      discount: f(discount),
      taxable: f(taxable),
      tax: f(tax),
      cgst: f(cgst),
      sgst: f(sgst),
      igst: f(igst),
      shipping: f(shipping),
      other_charges: f(other),
      round_off: f(roundOff),
      grand_total: f(grand),
    },
  };
}

/**
 * Convert a tax-inclusive price to the pre-tax unit price (kept to 4 decimals so
 * that quantity × price + tax lands back on the inclusive price).
 */
export function exclusivePrice(inclusivePrice, rate) {
  const divisor = add('100', rate);
  if (isZero(divisor)) return toPlain(inclusivePrice);
  return toPlain(round(div(mul(inclusivePrice, '100'), divisor), 4));
}

/** Convert an amount from document currency to base currency using the stored rate. */
export function toBaseCurrency(amount, exchangeRate, decimals = 2) {
  return toFixed(mul(amount, exchangeRate || '1'), decimals);
}

export { sub };
