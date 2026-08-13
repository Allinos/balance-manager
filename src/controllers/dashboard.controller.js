'use strict';

const CollectionModel = require('../models/collection.model');
const DepositModel = require('../models/deposit.model');
const DmsModel = require('../models/dms.model');
const { buildLedger } = require('../services/ledger.service');
const { resolveRange, toFilter } = require('../utils/range');

exports.index = async (req, res) => {
  const range = resolveRange(req.query, { fallback: 'all' });
  const filter = toFilter(range);

  const [collTotals, depTotals, dmsTotals, rangeLedger, fullLedger] = await Promise.all([
    CollectionModel.totals(filter),
    DepositModel.totals(filter),
    DmsModel.totals(filter),
    buildLedger(filter),
    buildLedger(), // full ledger → true current balances
  ]);

  // Current balances reflect the latest running state overall (not range-bound).
  const last = fullLedger.length ? fullLedger[fullLedger.length - 1] : null;
  const currentBalance = last ? last.remaining_balance : 0;
  const availableCash = last ? last.available_cash : 0;
  const availableOnline = last ? last.available_online : 0;

  res.render('dashboard/index', {
    title: 'Dashboard',
    active: 'dashboard',
    range,
    cards: {
      totalCollection: Number(collTotals.total_collection),
      online: Number(collTotals.online),
      cash: Number(collTotals.cash),
      creditBalance: Number(collTotals.credit_balance),
      totalDeposits: Number(depTotals.total),
      currentBalance,
      availableCash,
      availableOnline,
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
  const range = resolveRange(req.query, { fallback: 'all' });
  const ledger = await buildLedger(toFilter(range));
  res.json({
    labels: ledger.map((r) => r.collection_date),
    total: ledger.map((r) => Number(r.total_collection)),
    deposits: ledger.map((r) => Number(r.deposits || 0)),
    remaining: ledger.map((r) => Number(r.remaining_balance)),
  });
};
