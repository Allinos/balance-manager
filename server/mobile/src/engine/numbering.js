/**
 * Automatic document numbering — the desktop's numbering.rs, line for line.
 *
 * Format tokens: {PREFIX} {NUM} {FY} (2026-27) {FYS} (26-27) {YYYY} {YY} {MM}.
 * Numbers are allocated inside the same IndexedDB transaction that saves the document.
 */

import { AppError, sequenceRow } from './db.js';

function yearMonth(date) {
  const parts = String(date || '').split('-');
  const y = Number.parseInt(parts[0], 10);
  const m = Number.parseInt(parts[1], 10);
  if (parts.length >= 2 && m >= 1 && m <= 12 && y >= 1900 && y <= 9999) return [y, m];
  const t = new Date();
  return [t.getFullYear(), t.getMonth() + 1];
}

const two = (n) => String(((n % 100) + 100) % 100).padStart(2, '0');

/** Fiscal year label (e.g. "2026-27") and short label ("26-27"). */
export function fiscalYear(date, startMonth) {
  const [y, m] = yearMonth(date);
  const start = Math.min(12, Math.max(1, startMonth));
  if (start === 1) return [String(y), two(y)];
  const startYear = m >= start ? y : y - 1;
  const end = (startYear + 1) % 100;
  return [`${startYear}-${two(end)}`, `${two(startYear)}-${two(end)}`];
}

export function formatNumber(seq, n, date, fyStart) {
  const [y, m] = yearMonth(date);
  const [fy, fys] = fiscalYear(date, fyStart);
  const width = Math.min(12, Math.max(1, Number(seq.padding) || 5));
  const format = String(seq.format || '').trim() ? seq.format : '{PREFIX}-{NUM}';
  return format
    .replaceAll('{PREFIX}', seq.prefix)
    .replaceAll('{FYS}', fys)
    .replaceAll('{FY}', fy)
    .replaceAll('{YYYY}', String(y))
    .replaceAll('{YY}', two(y))
    .replaceAll('{MM}', String(m).padStart(2, '0'))
    .replaceAll('{NUM}', String(n).padStart(width, '0'));
}

const periodFor = (seq, date, fyStart) => (seq.format.includes('{FY') ? fiscalYear(date, fyStart)[0] : String(yearMonth(date)[0]));

const effectiveNext = (seq, period) =>
  seq.reset_yearly && seq.last_period && seq.last_period !== period ? Math.max(1, seq.start_number) : Math.max(1, seq.next_number);

/** Fiscal-year start month from the settings store (default April). */
export async function fiscalStartMonth(settingsStore) {
  const v = Number.parseInt(String((await settingsStore.get('fiscalYearStartMonth')) ?? '').replace(/"/g, ''), 10);
  return v >= 1 && v <= 12 ? v : 4;
}

/** The sequence for a type, created on first use. */
export async function loadSequence(sequences, docType, defaultPrefix, { create = true } = {}) {
  let seq = await sequences.get(docType);
  if (!seq) {
    seq = sequenceRow(docType, String(defaultPrefix || '').trim() ? defaultPrefix : docType.slice(0, 3));
    if (create) await sequences.put(seq);
  }
  return seq;
}

/** Numbers already used by live documents of a type (optionally ignoring one document). */
export async function takenNumbers(documents, docType, excludeId) {
  const all = await documents.getAll();
  return new Set(all.filter((d) => d.document_type === docType && !d.deleted_at && d.id !== excludeId).map((d) => d.document_number));
}

function firstFree(seq, date, fyStart, taken) {
  const period = periodFor(seq, date, fyStart);
  let n = effectiveNext(seq, period);
  for (let i = 0; i < 10000; i += 1, n += 1) {
    const candidate = formatNumber(seq, n, date, fyStart);
    if (!taken.has(candidate)) return { candidate, n, period };
  }
  throw new AppError('Could not find a free document number. Please check numbering settings.');
}

/** The number the next saved document would receive (does not consume it). */
export async function preview({ sequences, documents, settings }, docType, defaultPrefix, date) {
  const seq = await loadSequence(sequences, docType, defaultPrefix, { create: false });
  const fyStart = await fiscalStartMonth(settings);
  return firstFree(seq, date, fyStart, await takenNumbers(documents, docType)).candidate;
}

/** Allocate the next free number and advance the sequence (call inside the save transaction). */
export async function allocate({ sequences, documents, settings }, docType, defaultPrefix, date) {
  const seq = await loadSequence(sequences, docType, defaultPrefix);
  const fyStart = await fiscalStartMonth(settings);
  const { candidate, n, period } = firstFree(seq, date, fyStart, await takenNumbers(documents, docType));
  await sequences.put({ ...seq, next_number: n + 1, last_period: period });
  return candidate;
}

export async function ensureUnique(documents, docType, number, excludeId) {
  if ((await takenNumbers(documents, docType, excludeId)).has(number)) {
    throw new AppError(`Document number "${number}" is already used. Please choose a different number.`);
  }
}
