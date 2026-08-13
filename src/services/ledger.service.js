'use strict';

const CollectionModel = require('../models/collection.model');
const DepositModel = require('../models/deposit.model');
const DmsModel = require('../models/dms.model');
const { round2 } = require('../utils/money');

/**
 * Running-balance ledger engine.
 *
 * Business rules (see README):
 *   total_collection  = online + cash + credit_balance
 *   opening_balance   = previous day's remaining_balance
 *   remaining_balance = opening_balance + total_collection + old_balance_collection
 *                       - deposits_of_day - dms_deposits_of_day
 *   available_cash    = running cash on hand
 *                     = opening_cash + cash_collection
 *                       - cash_deposits(Cash/Bank) - cash_dms(mode Cash)
 *
 * Both regular deposits and DMS deposits are outflows that reduce the
 * remaining balance. A DMS deposit paid in Cash also reduces available cash;
 * a DMS deposit paid Online reduces only the overall balance.
 */

/** Compute total_collection for a single collection row. */
function computeTotal({ online, cash, credit_balance }) {
  return round2(Number(online) + Number(cash) + Number(credit_balance));
}

/**
 * Recompute opening / remaining / available_cash for every collection row,
 * ordered by date, folding in deposits and DMS deposits made on each date.
 * Persists the recalculated values back to the collections table.
 */
async function recalculateAll() {
  const collections = await CollectionModel.findAll(); // ascending by date
  const depositsByDate = await DepositModel.byDate();
  const dmsByDate = await DmsModel.byDate();

  let openingBalance = 0;
  let openingCash = 0;
  const ledger = [];

  for (const row of collections) {
    const totalCollection = computeTotal(row);
    const oldBalance = Number(row.old_balance_collection) || 0;

    const dep = depositsByDate.get(row.collection_date) || { total: 0, cash: 0 };
    const dms = dmsByDate.get(row.collection_date) || { total: 0, cash: 0, online: 0 };

    const outflow = round2(dep.total + dms.total);
    const remaining = round2(openingBalance + totalCollection + oldBalance - outflow);
    const availableCash = round2(openingCash + Number(row.cash) - dep.cash - dms.cash);

    // Persist only when something changed to avoid needless writes.
    if (
      round2(row.opening_balance) !== round2(openingBalance) ||
      round2(row.remaining_balance) !== remaining ||
      round2(row.available_cash) !== availableCash ||
      round2(row.total_collection) !== totalCollection
    ) {
      await CollectionModel.updateLedgerFields(row.id, {
        opening_balance: openingBalance,
        remaining_balance: remaining,
        available_cash: availableCash,
      });
      if (round2(row.total_collection) !== totalCollection) {
        await CollectionModel.update(row.id, {
          collection_date: row.collection_date,
          online: row.online,
          cash: row.cash,
          credit_balance: row.credit_balance,
          total_collection: totalCollection,
          old_balance_collection: row.old_balance_collection,
          remarks: row.remarks,
          updated_by: row.updated_by,
        });
      }
    }

    ledger.push({
      ...row,
      total_collection: totalCollection,
      opening_balance: round2(openingBalance),
      deposits: round2(dep.total),
      dms_deposits: round2(dms.total),
      remaining_balance: remaining,
      available_cash: availableCash,
    });

    openingBalance = remaining;
    openingCash = availableCash;
  }

  return ledger;
}

/**
 * Return an in-memory ledger (no persistence) for display / reports,
 * optionally filtered by date range but always computed from the start
 * so opening balances stay correct.
 */
async function buildLedger({ start, end } = {}) {
  const all = await recalculateAll();
  if (!start || !end) return all;
  return all.filter((r) => r.collection_date >= start && r.collection_date <= end);
}

module.exports = { computeTotal, recalculateAll, buildLedger };
