'use strict';

const DmsModel = require('../models/dms.model');
const AccountModel = require('../models/account.model');
const { recalculateAll } = require('../services/ledger.service');
const audit = require('../services/audit.service');
const { round2 } = require('../utils/money');
const { todayISO } = require('../utils/date');

const STATUSES = ['pending', 'on_hold', 'completed'];
const MODES = ['Cash', 'Online'];

/** Accounts plus a { name: balance } map (balance = total DMS into the account). */
async function formLists() {
  const [accounts, balancesMap] = await Promise.all([
    AccountModel.findActive(),
    DmsModel.totalsByAccount(),
  ]);
  const accountBalances = {};
  for (const a of accounts) accountBalances[a.name] = balancesMap.get(a.name) || 0;
  return { accounts, accountBalances, statuses: STATUSES, modes: MODES };
}

exports.list = async (req, res) => {
  const { start, end, status, mode } = req.query;
  const filter = {
    ...(start && end ? { start, end } : {}),
    ...(status ? { status } : {}),
    ...(mode ? { mode } : {}),
  };
  const [records, totals] = await Promise.all([
    DmsModel.findAll(filter),
    DmsModel.totals(start && end ? { start, end } : {}),
  ]);
  res.render('dms/list', {
    title: 'DMS Deposits',
    active: 'dms',
    records,
    summary: totals,
    statuses: STATUSES,
    modes: MODES,
    filters: { start: start || '', end: end || '', status: status || '', mode: mode || '' },
  });
};

exports.showCreate = async (req, res) => {
  const lists = await formLists();
  res.render('dms/form', {
    title: 'Add DMS Deposit',
    active: 'dms',
    record: { dms_date: todayISO(), payment_mode: 'Cash', status: 'pending' },
    ...lists,
    formAction: '/dms',
    isEdit: false,
  });
};

exports.create = async (req, res) => {
  const body = req.body;
  const created = await DmsModel.create({
    dms_date: body.dms_date,
    payment_mode: MODES.includes(body.payment_mode) ? body.payment_mode : 'Cash',
    account: body.account,
    amount: round2(body.amount),
    status: STATUSES.includes(body.status) ? body.status : 'pending',
    deposited_by: body.deposited_by,
    remarks: body.remarks,
    created_by: req.session.user.id,
  });
  await recalculateAll(); // deduct from balances
  await audit.record(req, { action: 'CREATE', entity: 'dms', entityId: created.id });
  req.flash('success', 'DMS deposit added.');
  res.redirect('/dms');
};

exports.showEdit = async (req, res) => {
  const record = await DmsModel.findById(req.params.id);
  if (!record) {
    req.flash('error', 'DMS record not found.');
    return res.redirect('/dms');
  }
  const lists = await formLists();
  res.render('dms/form', {
    title: 'Edit DMS Deposit',
    active: 'dms',
    record,
    ...lists,
    formAction: `/dms/${record.id}?_method=PUT`,
    isEdit: true,
  });
};

exports.update = async (req, res) => {
  const id = req.params.id;
  const body = req.body;
  await DmsModel.update(id, {
    dms_date: body.dms_date,
    payment_mode: MODES.includes(body.payment_mode) ? body.payment_mode : 'Cash',
    account: body.account,
    amount: round2(body.amount),
    status: STATUSES.includes(body.status) ? body.status : 'pending',
    deposited_by: body.deposited_by,
    remarks: body.remarks,
  });
  await recalculateAll();
  await audit.record(req, { action: 'UPDATE', entity: 'dms', entityId: id });
  req.flash('success', 'DMS deposit updated.');
  res.redirect('/dms');
};

exports.remove = async (req, res) => {
  const id = req.params.id;
  await DmsModel.remove(id);
  await recalculateAll();
  await audit.record(req, { action: 'DELETE', entity: 'dms', entityId: id });
  req.flash('success', 'DMS deposit deleted.');
  res.redirect('/dms');
};

exports.apiList = async (req, res) => {
  const { start, end, status, mode } = req.query;
  res.json(
    await DmsModel.findAll({
      ...(start && end ? { start, end } : {}),
      ...(status ? { status } : {}),
      ...(mode ? { mode } : {}),
    })
  );
};
