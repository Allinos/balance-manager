'use strict';

const config = require('../config/env');

/** Convert any input into a safe 2-decimal number. */
function toAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Round to 2 decimals. */
function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Format an amount for display, e.g. ₹ 1,09,060.00 (Indian grouping). */
function formatCurrency(value, symbol = config.currencySymbol) {
  const n = round2(value);
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return `${n < 0 ? '-' : ''}${symbol} ${formatted}`;
}

module.exports = { toAmount, round2, formatCurrency };
