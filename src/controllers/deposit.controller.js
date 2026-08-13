'use strict';

const DepositModel = require('../models/deposit.model');
const DepositorModel = require('../models/depositor.model');
const { recalculateAll } = require('../services/ledger.service');
const audit = require('../services/audit.service');
const { round2 } = require('../utils/money');
const { todayISO } = require('../utils/date');

exports.list = async (req, res) => {
  const { start, end } = req.query;
  const range = start && end ? { start, end } : {};
  const [deposits, totals] = await Promise.all([
    DepositModel.findAll(range),
    DepositModel.totals(range),
  ]);
  res.render('deposits/list', {
    title: 'Deposits',
    active: 'deposits',
    deposits,
    summary: { total: Number(totals.total), entries: Number(totals.entries) },
    filters: { start: start || '', end: end || '' },
  });
};

exports.showCreate = async (req, res) => {
  const depositors = await DepositorModel.findActive();
  res.render('deposits/form', {
    title: 'Add Deposit',
    active: 'deposits',
    deposit: { deposit_date: todayISO(), mode: 'Bank' },
    depositors,
    formAction: '/deposits',
    isEdit: false,
  });
};

exports.create = async (req, res) => {
  const body = req.body;
  const created = await DepositModel.create({
    deposit_date: body.deposit_date,
    amount: round2(body.amount),
    mode: body.mode,
    deposited_by: body.deposited_by,
    reference_no: body.reference_no,
    remarks: body.remarks,
    created_by: req.session.user.id,
  });
  await recalculateAll();
  await audit.record(req, { action: 'CREATE', entity: 'deposit', entityId: created.id });
  req.flash('success', 'Deposit recorded.');
  res.redirect('/deposits');
};

exports.showEdit = async (req, res) => {
  const deposit = await DepositModel.findById(req.params.id);
  if (!deposit) {
    req.flash('error', 'Deposit not found.');
    return res.redirect('/deposits');
  }
  const depositors = await DepositorModel.findActive();
  res.render('deposits/form', {
    title: 'Edit Deposit',
    active: 'deposits',
    deposit,
    depositors,
    formAction: `/deposits/${deposit.id}?_method=PUT`,
    isEdit: true,
  });
};

exports.update = async (req, res) => {
  const id = req.params.id;
  const body = req.body;
  await DepositModel.update(id, {
    deposit_date: body.deposit_date,
    amount: round2(body.amount),
    mode: body.mode,
    deposited_by: body.deposited_by,
    reference_no: body.reference_no,
    remarks: body.remarks,
  });
  await recalculateAll();
  await audit.record(req, { action: 'UPDATE', entity: 'deposit', entityId: id });
  req.flash('success', 'Deposit updated.');
  res.redirect('/deposits');
};

exports.remove = async (req, res) => {
  const id = req.params.id;
  await DepositModel.remove(id);
  await recalculateAll();
  await audit.record(req, { action: 'DELETE', entity: 'deposit', entityId: id });
  req.flash('success', 'Deposit deleted.');
  res.redirect('/deposits');
};

exports.apiList = async (req, res) => {
  const { start, end } = req.query;
  res.json(await DepositModel.findAll(start && end ? { start, end } : {}));
};
