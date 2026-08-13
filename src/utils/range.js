'use strict';

const { toISODate } = require('./date');

/** Presets available in the standard date filter. */
const PRESETS = ['all', 'today', 'yesterday', 'last7', 'last30'];

const LABELS = {
  all: 'All',
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 Days',
  last30: 'Last 30 Days',
  custom: 'Custom',
};

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Resolve a { start, end, preset } window from a query object.
 *
 * Priority:
 *   1. explicit preset (today/yesterday/last7/last30/all)
 *   2. explicit start+end  → custom
 *   3. fallback (defaults to "all" unless overridden)
 *
 * `start`/`end` are ISO date strings, or null for an unbounded window.
 */
function resolveRange(query = {}, { fallback = 'all' } = {}) {
  const today = new Date();
  const preset = query.preset && PRESETS.includes(query.preset) ? query.preset : null;

  if (preset) {
    switch (preset) {
      case 'today':
        return { start: toISODate(today), end: toISODate(today), preset };
      case 'yesterday': {
        const y = toISODate(addDays(today, -1));
        return { start: y, end: y, preset };
      }
      case 'last7':
        return { start: toISODate(addDays(today, -6)), end: toISODate(today), preset };
      case 'last30':
        return { start: toISODate(addDays(today, -29)), end: toISODate(today), preset };
      case 'all':
      default:
        return { start: null, end: null, preset: 'all' };
    }
  }

  if (query.start && query.end) {
    return { start: query.start, end: query.end, preset: 'custom' };
  }

  if (fallback === 'all') return { start: null, end: null, preset: 'all' };
  // Fallback can also be a { start, end } object (e.g. dashboard data span).
  if (typeof fallback === 'object' && fallback.start && fallback.end) {
    return { start: fallback.start, end: fallback.end, preset: 'custom' };
  }
  return { start: null, end: null, preset: 'all' };
}

/** Convenience for models that expect { start, end } only when both are set. */
function toFilter({ start, end }) {
  return start && end ? { start, end } : {};
}

module.exports = { PRESETS, LABELS, resolveRange, toFilter };
