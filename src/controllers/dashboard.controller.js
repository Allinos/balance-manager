'use strict';

const CollectionModel = require('../models/collection.model');
const DepositModel = require('../models/deposit.model');
const DmsModel = require('../models/dms.model');
const { buildLedger } = require('../services/ledger.service');
const { currentMonthRange } = require('../utils/date');

exports.index = async (req, res) => {
  const { start, end } = req.query.start && req.query.end
    ? { start: req.query.start, end: req.query.end }
    : currentMonthRange();

  const [collTotals, depTotals, dmsSummary, ledger] = await Promise.all([
    CollectionModel.totals({ start, end }),
    DepositModel.totals({ start, end }),
    DmsModel.summary({ start, end }),
    buildLedger({ start, end }),
  ]);

  const currentBalance = ledger.length ? ledger[ledger.length - 1].remaining_balance : 0;
  const availableCash = ledger.length ? ledger[ledger.length - 1].available_cash : 0;

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
      dmsAmount: Number(dmsSummary.dms_amount),
      dmsVariance: Number(dmsSummary.variance),
      dmsPending: Number(dmsSummary.pending) || 0,
      dmsMismatch: Number(dmsSummary.mismatch) || 0,
      entries: Number(collTotals.entries),
    },
    // Chart data
    chart: {
      labels: ledger.map((r) => r.collection_date),
      online: ledger.map((r) => Number(r.online)),
      cash: ledger.map((r) => Number(r.cash)),
      creditBalance: ledger.map((r) => Number(r.credit_balance)),
      total: ledger.map((r) => Number(r.total_collection)),
      deposits: ledger.map((r) => Number(r.deposits || 0)),
      remaining: ledger.map((r) => Number(r.remaining_balance)),
    },
    recent: ledger.slice(-8).reverse(),
  });
};

// JSON endpoint used for AJAX refresh of charts
exports.data = async (req, res) => {
  const { start, end } = req.query.start && req.query.end
    ? { start: req.query.start, end: req.query.end }
    : currentMonthRange();
  const ledger = await buildLedger({ start, end });
  res.json({
    labels: ledger.map((r) => r.collection_date),
    total: ledger.map((r) => Number(r.total_collection)),
    deposits: ledger.map((r) => Number(r.deposits || 0)),
    remaining: ledger.map((r) => Number(r.remaining_balance)),
  });
};
