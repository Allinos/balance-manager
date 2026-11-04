/**
 * Thermal receipts (58 mm / 80 mm roll printers), for desktop, the phone app and the Android app.
 *
 * One plain-text layout, so it prints the same everywhere:
 *   - receiptLines(): the receipt as lines (shop, bill, items, totals, paid / due, UPI) for a paper width;
 *   - printThermal(): desktop and browser — a narrow page through the system print dialog (USB / network
 *     thermal printers installed as a normal printer);
 *   - escposBytes(): the Android app — ESC/POS commands sent to a paired Bluetooth printer (android-app).
 * Characters per line: 58 mm = 32, 80 mm = 48 (Font A).
 */

import { getType } from '../config/documentTypes.js';
import { formatDate } from '../utils/dates.js';
import { dec } from '../utils/decimal.js';

export const THERMAL_PAPERS = { 58: { chars: 32, mm: 58 }, 80: { chars: 48, mm: 80 } };
export const paperOf = (settings) => (String(settings?.thermalPaper) === '80' ? 80 : 58);

const metaOf = (doc) => {
  if (doc?.meta && typeof doc.meta === 'object') return doc.meta;
  try {
    return JSON.parse(doc?.meta || '{}') || {};
  } catch {
    return {};
  }
};

/** 1234.5 → "1,234.50" (Indian grouping), without a symbol. */
export function amountText(value, decimals = 2) {
  const n = Number(value || 0);
  return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Left and right text on one line, padded to the width (left side cut when too long). */
export function lr(left, right, width) {
  const r = String(right ?? '');
  const room = Math.max(1, width - r.length - 1);
  const l = String(left ?? '');
  const cut = l.length > room ? `${l.slice(0, Math.max(1, room - 1))}…` : l;
  return `${cut}${' '.repeat(Math.max(1, width - cut.length - r.length))}${r}`;
}

/** Word-wraps text to the width. */
export function wrap(text, width) {
  const out = [];
  for (const para of String(text || '').split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= width) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
      while (line.length > width) {
        out.push(line.slice(0, width));
        line = line.slice(width);
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/**
 * The receipt as lines: { text, align: 'left'|'center', bold?, big?, rule? }.
 * @param {{ document: Object, items: Object[] }} bundle  a saved document (getDocument)
 * @param {{ company?: Object, settings?: Object, paper?: 58|80, symbol?: string }} options
 *   symbol: the currency sign printed with the total ("₹" on screen; "Rs." on printers without it)
 */
export function receiptLines(bundle, { company = {}, settings = {}, paper = paperOf(settings), symbol } = {}) {
  const width = THERMAL_PAPERS[paper]?.chars || 32;
  const doc = bundle.document;
  const items = bundle.items || [];
  const meta = metaOf(doc);
  const decimals = Number(doc.currency_decimals ?? 2);
  const sym = symbol ?? (doc.currency_symbol || '₹');
  const money = (v) => amountText(v, decimals);
  const lines = [];
  const add = (text, opts = {}) => lines.push({ text, align: 'left', ...opts });
  const rule = () => lines.push({ text: '-'.repeat(width), align: 'left', rule: true });

  // Shop
  if (company.name) for (const l of wrap(company.name, paper === 80 ? 24 : 16)) add(l, { align: 'center', bold: true, big: true });
  for (const l of wrap(company.address, width)) add(l, { align: 'center' });
  const contact = [company.phone && `Ph: ${company.phone}`, company.gstin && `GSTIN: ${company.gstin}`].filter(Boolean);
  for (const c of contact) add(c, { align: 'center' });
  rule();
  const type = getType(doc.document_type);
  add(type.title || type.label, { align: 'center', bold: true });
  add(lr(`No: ${doc.document_number}`, formatDate(doc.issue_date, settings.dateFormat), width));
  if (doc.party_name) add(`To: ${doc.party_name}`.slice(0, width));
  if (doc.party_phone) add(`Ph: ${doc.party_phone}`.slice(0, width));
  rule();

  // Items: the name, then "qty x rate .... amount".
  items.forEach((it, i) => {
    const name = wrap(`${i + 1}. ${it.name || ''}`, width);
    name.forEach((l) => add(l));
    const qty = `${Number(it.quantity || 0)}${it.unit ? ` ${it.unit}` : ''} x ${money(it.unit_price)}`;
    add(lr(`   ${qty}`, money(it.total_amount ?? Number(it.quantity || 0) * Number(it.unit_price || 0)), width));
  });
  rule();

  // Totals
  const nonZero = (v) => dec(v || '0') !== 0n;
  if (nonZero(doc.discount) || nonZero(doc.tax) || nonZero(doc.shipping) || nonZero(doc.other_charges)) add(lr('Subtotal', money(doc.subtotal), width));
  if (nonZero(doc.discount)) add(lr('Discount', `-${money(doc.discount)}`, width));
  if (nonZero(doc.cgst)) add(lr('CGST', money(doc.cgst), width));
  if (nonZero(doc.sgst)) add(lr('SGST', money(doc.sgst), width));
  if (nonZero(doc.igst)) add(lr('IGST', money(doc.igst), width));
  if (!nonZero(doc.cgst) && !nonZero(doc.sgst) && !nonZero(doc.igst) && nonZero(doc.tax)) add(lr(doc.tax_label || 'Tax', money(doc.tax), width));
  if (nonZero(doc.shipping)) add(lr('Shipping', money(doc.shipping), width));
  if (nonZero(doc.other_charges)) add(lr(doc.other_charges_label || 'Other charges', money(doc.other_charges), width));
  if (nonZero(doc.round_off)) add(lr('Round off', money(doc.round_off), width));
  add(lr('TOTAL', `${sym}${money(doc.grand_total)}`, width), { bold: true });
  const paid = dec(meta.paid || '0');
  if (paid > 0n) {
    const due = dec(doc.grand_total || '0') - paid;
    add(lr(`Paid${meta.payments?.[0]?.mode ? ` (${meta.payments.map((p) => p.mode).filter(Boolean).join(', ')})` : ''}`, money(meta.paid), width));
    if (due > 0n) add(lr('Balance due', money(Number(doc.grand_total) - Number(meta.paid)), width), { bold: true });
  }
  rule();
  if (company.upi_id) add(`Pay by UPI: ${company.upi_id}`.slice(0, width), { align: 'center' });
  add('Thank you! Visit again.', { align: 'center' });
  return lines;
}

/** Plain text of the lines (centred where asked), e.g. for a preview or a test. */
export function receiptText(lines, paper = 58) {
  const width = THERMAL_PAPERS[paper]?.chars || 32;
  return lines
    .map((l) => {
      const w = l.big ? Math.floor(width / 2) : width;
      if (l.align !== 'center') return l.text;
      const pad = Math.max(0, Math.floor((w - l.text.length) / 2));
      return `${' '.repeat(pad)}${l.text}`;
    })
    .join('\n');
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The receipt as HTML for printing (monospace, the paper's width). */
export function receiptHtml(lines, paper = 58) {
  const rows = lines
    .map((l) => `<div class="tr-line${l.align === 'center' ? ' tr-c' : ''}${l.bold ? ' tr-b' : ''}${l.big ? ' tr-big' : ''}">${escapeHtml(l.text) || '&nbsp;'}</div>`)
    .join('');
  return `<div class="thermal-receipt tr-${paper}" data-testid="thermal-receipt">${rows}</div>`;
}

/**
 * Print the receipt through the system print dialog on a narrow roll page (desktop and browser).
 * @param {Object[]} lines  receiptLines()
 * @param {58|80} paper
 * @param {() => Promise<void>|void} print  opens the print dialog (desktop: printCurrent; browser: window.print)
 */
export async function printThermal(lines, paper, print) {
  const mm = THERMAL_PAPERS[paper]?.mm || 58;
  const holder = document.createElement('div');
  holder.id = 'thermal-print';
  holder.innerHTML = receiptHtml(lines, paper);
  const page = document.createElement('style');
  page.id = 'thermal-page';
  // Later @page rules win: a roll as wide as the paper, as long as the receipt.
  page.textContent = `@page { size: ${mm}mm auto; margin: 2mm; }`;
  document.body.appendChild(holder);
  document.head.appendChild(page);
  document.documentElement.classList.add('thermal-printing');
  try {
    await print();
  } finally {
    // The print dialog may return before printing ends: tidy up a moment later.
    setTimeout(() => {
      document.documentElement.classList.remove('thermal-printing');
      holder.remove();
      page.remove();
    }, 1500);
  }
}

/** ESC/POS bytes for a Bluetooth / USB thermal printer (Android app). Characters outside ASCII become close matches. */
export function escposBytes(lines) {
  const out = [];
  const push = (...b) => out.push(...b);
  const ascii = (s) =>
    String(s)
      .replace(/₹/g, 'Rs.')
      .replace(/[–—]/g, '-')
      .replace(/…/g, '...')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .normalize('NFD')
      .replace(/[^\x20-\x7e]/g, '');
  push(0x1b, 0x40); // initialise
  for (const l of lines) {
    push(0x1b, 0x61, l.align === 'center' ? 1 : 0); // align
    push(0x1b, 0x45, l.bold ? 1 : 0); // bold
    push(0x1d, 0x21, l.big ? 0x11 : 0x00); // double width + height
    for (const ch of ascii(l.text)) push(ch.charCodeAt(0));
    push(0x0a);
  }
  push(0x1b, 0x61, 0, 0x1d, 0x21, 0, 0x1b, 0x45, 0);
  push(0x0a, 0x0a, 0x0a); // feed past the tear bar
  push(0x1d, 0x56, 0x42, 0x00); // cut (ignored by printers without a cutter)
  return Uint8Array.from(out);
}

/** Base64 of bytes (for the Android bridge). */
export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
