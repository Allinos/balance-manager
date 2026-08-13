'use strict';

const CollectionModel = require('../models/collection.model');
const DepositModel = require('../models/deposit.model');
const { round2 } = require('../utils/money');

/**
 * Running-balance ledger engine.
 *
 * Business rules (see README):
 *   total_collection  = online + cash + credit_balance
 *   opening_balance   = previous day's remaining_balance
 *   remaining_balance = opening_balance + total_collection
 *                       + old_balance_collection - deposits_of_day
 *   available_cash    = remaining_balance (cash on hand awaiting deposit)
 */

/** Compute total_collection for a single collection row. */
function computeTotal({ online, cash, credit_balance }) {
  return round2(Number(online) + Number(cash) + Number(credit_balance));
}

/**
 * Recompute opening / remaining / available_cash for every collection row,
 * ordered by date, folding in deposits made on each date.
 * Persists the recalculated values back to the collections table.
 */
async function recalculateAll() {
  const collections = await CollectionModel.findAll(); // ascending by date
  const depositsByDate = await DepositModel.totalsByDate();

  let openingBalance = 0;
  const ledger = [];

  for (const row of collections) {
    const totalCollection = computeTotal(row);
    const oldBalance = Number(row.old_balance_collection) || 0;
    const deposits = depositsByDate.get(row.collection_date) || 0;

    const remaining = round2(openingBalance + totalCollection + oldBalance - deposits);
    const availableCash = remaining;

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
      // total_collection is stored on create/update, keep it in sync here too.
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
      deposits: round2(deposits),
      remaining_balance: remaining,
      available_cash: availableCash,
    });

    openingBalance = remaining;
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
