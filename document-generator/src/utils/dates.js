/** Local-date helpers. Dates are stored as ISO `YYYY-MM-DD` strings (no time zone shifts). */

const pad = (n) => String(n).padStart(2, '0');

/** @param {Date} d */
export const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayISO = () => toISODate(new Date());

/** @param {string} iso */
export function parseISODate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function addDays(iso, days) {
  const d = parseISODate(iso) || new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return toISODate(d);
}

export function startOfWeek(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return toISODate(d);
}

export const startOfMonth = (date = new Date()) => toISODate(new Date(date.getFullYear(), date.getMonth(), 1));

export const endOfMonth = (date = new Date()) => toISODate(new Date(date.getFullYear(), date.getMonth() + 1, 0));

/** Date range for a quick filter key. */
export function rangeFor(key, custom = {}) {
  const now = new Date();
  switch (key) {
    case 'today':
      return { from: todayISO(), to: todayISO() };
    case 'week':
      return { from: startOfWeek(now), to: todayISO() };
    case 'month':
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'lastMonth': {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: startOfMonth(d), to: endOfMonth(d) };
    }
    case 'custom':
      return { from: custom.from || '', to: custom.to || '' };
    default:
      return { from: '', to: '' };
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DATE_FORMATS = ['DD-MM-YYYY', 'DD/MM/YYYY', 'DD MMM YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

/** Format an ISO date for display/printing. */
export function formatDate(iso, format = 'DD-MM-YYYY') {
  const d = parseISODate(iso);
  if (!d) return '';
  const DD = pad(d.getDate());
  const MM = pad(d.getMonth() + 1);
  const YYYY = String(d.getFullYear());
  switch (format) {
    case 'DD/MM/YYYY':
      return `${DD}/${MM}/${YYYY}`;
    case 'DD MMM YYYY':
      return `${DD} ${MONTHS[d.getMonth()]} ${YYYY}`;
    case 'MM/DD/YYYY':
      return `${MM}/${DD}/${YYYY}`;
    case 'YYYY-MM-DD':
      return `${YYYY}-${MM}-${DD}`;
    default:
      return `${DD}-${MM}-${YYYY}`;
  }
}

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export const daysBetween = (fromMs, toMs) => (toMs - fromMs) / 86400000;

/** Short local date + time for status lines, e.g. "29 Sep 2026, 10:42". */
export function formatDateTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "Due in" choices for a due date: days after the document date (0 = on receipt). */
export const DUE_TERMS = [0, 7, 15, 30, 45, 60, 90];

/** Days from the document date to the due date, or null when either is missing. */
export function dueTermOf(issue, due) {
  const a = parseISODate(issue);
  const b = parseISODate(due);
  return a && b ? Math.round(daysBetween(a.getTime(), b.getTime())) : null;
}

/**
 * Patch for a new document date: the due date moves with it, keeping the same terms
 * (an invoice due in 15 days stays due in 15 days).
 */
export function issueDatePatch(doc, issue) {
  const term = dueTermOf(doc.issue_date, doc.due_date);
  return term === null || !parseISODate(issue) ? { issue_date: issue } : { issue_date: issue, due_date: addDays(issue, term) };
}
