'use strict';

const CollectionModel = require('../models/collection.model');
const DepositModel = require('../models/deposit.model');
const DmsModel = require('../models/dms.model');
const { buildLedger } = require('../services/ledger.service');
const { currentMonthRange } = require('../utils/date');

/**
 * Resolve the active date range. Explicit query wins; otherwise default to
 * the full span of collection data (so the dashboard is never empty just
 * because "today" is in a month with no entries), falling back to the
 * current month when there is no data at all.
 */
async function resolveRange(req) {
  if (req.query.start && req.query.end) {
    return { start: req.query.start, end: req.query.end };
  }
  const bounds = await CollectionModel.dateBounds();
  if (bounds.min && bounds.max) return { start: bounds.min, end: bounds.max };
  return currentMonthRange();
}

exports.index = async (req, res) => {
  const { start, end } = await resolveRange(req);

  const [collTotals, depTotals, dmsTotals, rangeLedger, fullLedger] = await Promise.all([
    CollectionModel.totals({ start, end }),
    DepositModel.totals({ start, end }),
    DmsModel.totals({ start, end }),
    buildLedger({ start, end }),
    buildLedger(), // full ledger → true current balance & available cash
  ]);

  // Current balance / available cash reflect the latest running state overall.
  const last = fullLedger.length ? fullLedger[fullLedger.length - 1] : null;
  const currentBalance = last ? last.remaining_balance : 0;
  const availableCash = last ? last.available_cash : 0;

  res.render('dashboard/index', {
    title: 'Dashboard',
    active: 'dashboard',
    range: { start, end },
    cards: {
      totalCollection: Number(collTotals.total_collection),
      online: Number(collTotals.online),
      cash: Number(collTotals.cash),
      creditBalance: Number(collTotals.credit_balance),
      totalDeposits: Number(depTotals.total),
      currentBalance,
      availableCash,
      dmsAmount: Number(dmsTotals.amount),
      dmsPending: Number(dmsTotals.pending) || 0,
      dmsOnHold: Number(dmsTotals.on_hold) || 0,
      dmsCompleted: Number(dmsTotals.completed) || 0,
      entries: Number(collTotals.entries),
    },
    chart: {
      labels: rangeLedger.map((r) => r.collection_date),
      online: rangeLedger.map((r) => Number(r.online)),
      cash: rangeLedger.map((r) => Number(r.cash)),
      creditBalance: rangeLedger.map((r) => Number(r.credit_balance)),
      total: rangeLedger.map((r) => Number(r.total_collection)),
      deposits: rangeLedger.map((r) => Number(r.deposits || 0)),
      remaining: rangeLedger.map((r) => Number(r.remaining_balance)),
    },
    recent: rangeLedger.slice(-8).reverse(),
  });
};

// JSON endpoint used for AJAX refresh of charts
exports.data = async (req, res) => {
  const { start, end } = await resolveRange(req);
  const ledger = await buildLedger({ start, end });
  res.json({
    labels: ledger.map((r) => r.collection_date),
    total: ledger.map((r) => Number(r.total_collection)),
    deposits: ledger.map((r) => Number(r.deposits || 0)),
    remaining: ledger.map((r) => Number(r.remaining_balance)),
  });
};
