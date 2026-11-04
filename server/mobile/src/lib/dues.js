/**
 * Payments due: customer bills with a due date that are not paid yet (engine: dues_list).
 *  - Home shows the overdue ones and those due in the next 7 days (DuesCard).
 *  - In the Android app, the bills due from today on are sent to Android, which shows a notification at 9:30 on
 *    each due date (android-app/lib/dues.dart). Settings → Features → Due date reminders switches that off.
 */

import { formatMoney } from '@desktop/utils/format.js';
import { todayISO } from '@desktop/utils/dates.js';
import { partyLedger } from '@desktop/services/ledgerService.js';
import { add, toFixed } from '@desktop/utils/decimal.js';
import { call } from '../engine/api.js';
import { bridge, native } from './native.js';

export const DUE_REMINDERS_SETTING = 'dueReminders';
export const dueRemindersOn = (settings) => settings?.[DUE_REMINDERS_SETTING] !== false;
export const SOON_DAYS = 7;

const DAY = 86400000;
const days = (from, to) => Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / DAY);

/** "Overdue 3 days", "Overdue 1 day", "Due today", "Due tomorrow", "Due in 5 days". */
export function dueLabel(dueDate, today = todayISO()) {
  const n = days(today, dueDate);
  if (n < 0) return `Overdue ${-n} day${n === -1 ? '' : 's'}`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due in ${n} days`;
}

/**
 * Customer bills still unpaid, with what is due. A bill of a saved customer takes its due from the customer's
 * ledger, so a payment received later ("Payment received", oldest bills first) counts too — even on a bill that
 * was left as a draft.
 * @param {{ all?: boolean }} options  all: also bills without a due date
 */
export async function openBills({ all = false } = {}) {
  const rows = await call('dues_list', { all });
  const parties = [...new Set(rows.map((r) => r.party_id).filter((id) => id !== null && id !== undefined))];
  const open = new Map();
  for (const id of parties) {
    try {
      const { ledger } = await partyLedger(id);
      for (const b of ledger.open) open.set(b.id, b.due);
    } catch {
      /* customer removed: keep the bill's own figures */
    }
  }
  return rows
    .filter((r) => r.party_id === null || r.party_id === undefined || !parties.includes(r.party_id) || open.has(r.id))
    .map((r) => (open.has(r.id) ? { ...r, due: open.get(r.id) } : r))
    .filter((r) => Number(r.due) > 0);
}

/** What all customers still owe on their bills, and on how many bills. */
export async function owedTotal() {
  const rows = await openBills({ all: true });
  return { total: toFixed(rows.reduce((s, r) => add(s, r.due), 0n), 2), count: rows.length };
}

export const listDues = () => openBills();

/** Overdue bills and those due within SOON_DAYS. */
export const dueSoon = (rows, today = todayISO()) => rows.filter((r) => days(today, r.due_date) <= SOON_DAYS);

const money = (r) => formatMoney(r.due, { currency: r.currency || 'INR', currency_symbol: r.currency_symbol || '₹', currency_decimals: r.currency_decimals ?? 2 });

/** Android app: hand the due dates from today on to Android for its notifications. Never throws. */
export async function syncDues(settings) {
  if (!native()) return null;
  try {
    const today = todayISO();
    const rows = (await listDues()).filter((r) => r.due_date >= today);
    return await bridge('dues.sync', {
      enabled: dueRemindersOn(settings),
      bills: rows.map((r) => ({ id: r.id, number: r.document_number, party: r.party_name, phone: r.party_phone, amount: money(r), dueDate: r.due_date })),
    });
  } catch {
    return null;
  }
}

export { money as dueMoney };
