/** Display formatting for money and quantities (string based, no float rounding). */

import { toFixed, toPlain } from './decimal.js';

/** Currencies that use Indian digit grouping (12,34,567.00). */
const INDIAN_GROUPING = new Set(['INR', 'NPR', 'PKR', 'BDT']);

function group(intText, indian) {
  if (intText.length <= 3) return intText;
  if (!indian) return intText.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const last3 = intText.slice(-3);
  const rest = intText.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/**
 * Format a decimal amount with grouping, e.g. 1234567.5 → '12,34,567.50' (INR).
 * @param {string|number|bigint} value
 * @param {{decimals?: number, currency?: string, symbol?: string}} [opts]
 */
export function formatAmount(value, { decimals = 2, currency = 'INR', symbol = '' } = {}) {
  const fixed = toFixed(value, decimals);
  const negative = fixed.startsWith('-');
  const [int, frac] = fixed.replace('-', '').split('.');
  const body = group(int, INDIAN_GROUPING.has(currency)) + (frac !== undefined ? `.${frac}` : '');
  return `${negative ? '-' : ''}${symbol}${body}`;
}

/** Money with currency symbol (document-aware). */
export function formatMoney(value, doc = {}) {
  return formatAmount(value, {
    decimals: doc.currency_decimals ?? doc.decimals ?? 2,
    currency: doc.currency || doc.code || 'INR',
    symbol: doc.currency_symbol ?? doc.symbol ?? '',
  });
}

/** Quantity without trailing zeros, e.g. '2.500' → '2.5'. */
export const formatQty = (value) => toPlain(value || '0');

/** Rate/percent display, e.g. '18.00' → '18'. */
export const formatRate = (value) => toPlain(value || '0');

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
