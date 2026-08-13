'use strict';

/** Return YYYY-MM-DD for a Date or date-like string. */
function toISODate(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    // Already ISO (possibly with time) – take the date part.
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Human friendly date, e.g. 01-Jul-26. */
function formatDate(value) {
  const iso = toISODate(value);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d}-${months[parseInt(m, 10) - 1]}-${y.slice(2)}`;
}

/** First and last day of the current month as ISO strings. */
function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

function todayISO() {
  return toISODate(new Date());
}

module.exports = { toISODate, formatDate, currentMonthRange, todayISO };
