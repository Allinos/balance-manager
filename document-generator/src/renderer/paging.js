/**
 * Full-page A4 layout for the Professional and Modern templates.
 *
 * The document is first drawn once, off screen, as one long sheet. Its parts are measured
 * (`measureFlow`), then `planPages` splits the item rows over A4 pages:
 *   - page 1 starts with the full header, later pages with a short "continued" header;
 *   - every page shows the item column headings; rows are never cut;
 *   - the totals, tax summary, bank details and signature (the "tail") stay together on the
 *     last page, which always keeps a few rows so it never holds the tail alone;
 *   - each page is stretched to the full A4 height with an empty "filler" in the item table.
 * Heights are CSS pixels (96 per inch), the same on screen and in print.
 */

export const MM = 96 / 25.4;
/** Printable height of A4 inside the 12 mm margins, less 0.5 mm so rounding never spills onto a new page. */
export const PAGE_HEIGHT = (297 - 24 - 0.5) * MM;
/** Space kept at the foot of every page of a multi-page bill for "Page 1 of 3". */
export const FOOTER_RESERVE = 6 * MM;
/** Fixed heights (also set in document.css): the "continued" header and the "Continued on page 2" line. */
export const CONT_HEAD = 9 * MM;
export const CONT_NOTE = 6 * MM;
/** Rows that move with the tail to the last page when only the tail does not fit. */
const ROWS_WITH_TAIL = 3;

const sum = (list, from = 0, to = list.length) => {
  let s = 0;
  for (let k = from; k < to; k++) s += list[k];
  return s;
};

/**
 * Split rows over pages.
 * @param {{rows: number[], headH: number, theadH: number, tailH: number, topCont: number, bottomCont: number}} m
 *   headH: page-1 content above the item table · theadH: column headings · rows: each item row ·
 *   tailH: everything below the last item row · topCont / bottomCont: "continued" header / line incl. spacing.
 * @returns {{from: number, to: number, first: boolean, last: boolean, fill: number, overflow: boolean}[]}
 */
/**
 * WebKit (the Linux desktop app, Safari on iPhone / Mac) lays printed pages out differently from Chrome
 * (Windows app, Android): print.css lets it scale the planned sheets to the page, and pages are planned
 * 3 % shorter there so rounding never pushes a sheet onto an extra page.
 */
export const WEBKIT_PRINT =
  typeof navigator !== 'undefined' &&
  ((/AppleWebKit/.test(navigator.userAgent) && !/(Chrome|Chromium|Edg)\//.test(navigator.userAgent)) || /CriOS|FxiOS|EdgiOS/.test(navigator.userAgent));
if (WEBKIT_PRINT && typeof document !== 'undefined') document.documentElement.classList.add('print-webkit');

export function planPages(m, cap = WEBKIT_PRINT ? PAGE_HEIGHT * 0.97 : PAGE_HEIGHT) {
  const n = m.rows.length;
  const capMulti = cap - FOOTER_RESERVE;
  const used = (p) => (p.first ? m.headH : m.topCont) + m.theadH + sum(m.rows, p.from, p.to) + (p.last ? m.tailH : m.bottomCont);

  // Everything on one page.
  if (m.headH + m.theadH + sum(m.rows) + m.tailH <= cap) {
    const page = { from: 0, to: n, first: true, last: true };
    return [{ ...page, fill: Math.max(0, cap - used(page)), overflow: false }];
  }

  const pages = [];
  let i = 0;
  while (pages.length < 500) {
    const first = pages.length === 0;
    const base = (first ? m.headH : m.topCont) + m.theadH;
    // The rest and the tail fit: last page.
    if (base + sum(m.rows, i) + m.tailH <= capMulti) {
      pages.push({ from: i, to: n, first, last: true });
      break;
    }
    // The tail is taller than a page by itself: let this last page run long rather than loop.
    if (!first && base + Math.min(sum(m.rows, i), m.rows[i] || 0) + m.tailH > capMulti && n - i <= ROWS_WITH_TAIL) {
      pages.push({ from: i, to: n, first, last: true, overflow: true });
      break;
    }
    let j = i;
    let height = base;
    while (j < n && height + m.rows[j] + m.bottomCont <= capMulti) height += m.rows[j++];
    if (j === n) {
      // All rows fit but not with the tail: carry the last few rows over with it.
      j = n - Math.min(ROWS_WITH_TAIL, Math.max(1, n - i - 1));
      if (j < i) j = i;
    }
    if (j === i && !(first && n - i <= 1)) j = i + 1; // one very tall row: give it its own page
    pages.push({ from: i, to: j, first, last: false });
    i = j;
  }
  return pages.map((p) => {
    const fill = capMulti - used(p);
    return { ...p, fill: Math.max(0, fill), overflow: !!p.overflow || fill < -1 };
  });
}

/** Classes of one paged A4 sheet. */
export const sheetClass = (page) =>
  page ? ` doc-sheet${page.last ? ' doc-sheet-last' : ''}${page.overflow ? ' doc-sheet-overflow' : ''}` : '';

const box = (el) => el.getBoundingClientRect();

/**
 * Measure a document drawn as one sheet. Returns null when it has no item table (e.g. receipts).
 * @param {HTMLElement} doc the `.doc` element
 */
export function measureFlow(doc) {
  const table = doc.querySelector('table.tp-items, table.doc-items');
  if (!table || !table.tHead) return null;
  const style = getComputedStyle(doc);
  // Rects are scaled when an ancestor is transformed; offsetWidth is not.
  const k = doc.offsetWidth / box(doc).width || 1;
  const top = box(doc).top + parseFloat(style.paddingTop || '0') / k;
  const kids = [...doc.children].filter((k) => !['absolute', 'fixed'].includes(getComputedStyle(k).position) && k.offsetHeight > 0);
  const bottom = Math.max(...kids.map((el) => box(el).bottom + parseFloat(getComputedStyle(el).marginBottom || '0') / k));
  const rowEls = [...table.tBodies[0].rows].filter((r) => r.classList.contains('tp-item') || r.classList.contains('doc-item-row'));
  const thead = box(table.tHead);
  const lastBottom = rowEls.length ? box(rowEls[rowEls.length - 1]).bottom : thead.bottom;
  const gap = parseFloat(style.rowGap) || 0;
  const frame = doc.querySelector('.tp-frame');
  const border = frame ? parseFloat(getComputedStyle(frame).borderTopWidth) || 0 : 0;
  return {
    headH: (thead.top - top) * k,
    theadH: thead.height * k,
    rows: rowEls.map((r) => box(r).height * k),
    tailH: (bottom - lastBottom) * k,
    topCont: CONT_HEAD + gap + border,
    bottomCont: CONT_NOTE + gap + border,
    colWidths: [...table.tHead.rows[0].cells].map((c) => box(c).width * k),
  };
}
