'use strict';

const DmsModel = require('../models/dms.model');
const audit = require('../services/audit.service');
const { round2 } = require('../utils/money');
const { todayISO } = require('../utils/date');

/** Derive variance & reconciliation status. */
function reconcile(dmsAmount, receiptAmount) {
  const variance = round2(Number(dmsAmount) - Number(receiptAmount));
  let status = 'pending';
  if (Number(receiptAmount) > 0) {
    status = variance === 0 ? 'reconciled' : 'mismatch';
  }
  return { variance, status };
}

exports.list = async (req, res) => {
  const { start, end, status } = req.query;
  const records = await DmsModel.findAll({
    ...(start && end ? { start, end } : {}),
    ...(status ? { status } : {}),
  });
  const summary = await DmsModel.summary(start && end ? { start, end } : {});
  res.render('dms/list', {
    title: 'DMS Deposits',
    active: 'dms',
    records,
    summary,
    filters: { start: start || '', end: end || '', status: status || '' },
  });
};

exports.showCreate = (req, res) => {
  res.render('dms/form', {
    title: 'Add DMS Deposit',
    active: 'dms',
    record: { dms_date: todayISO() },
    formAction: '/dms',
    isEdit: false,
  });
};

exports.create = async (req, res) => {
  const body = req.body;
  const dms_amount = round2(body.dms_amount);
  const receipt_amount = round2(body.receipt_amount || 0);
  const { variance, status } = reconcile(dms_amount, receipt_amount);

  const created = await DmsModel.create({
    dms_date: body.dms_date,
    dms_amount,
    receipt_amount,
    variance,
    status,
    reference_no: body.reference_no,
    remarks: body.remarks,
    created_by: req.session.user.id,
  });
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
  res.render('dms/form', {
    title: 'Edit DMS Deposit',
    active: 'dms',
    record,
    formAction: `/dms/${record.id}?_method=PUT`,
    isEdit: true,
  });
};

exports.update = async (req, res) => {
  const id = req.params.id;
  const body = req.body;
  const dms_amount = round2(body.dms_amount);
  const receipt_amount = round2(body.receipt_amount || 0);
  const { variance, status } = reconcile(dms_amount, receipt_amount);

  await DmsModel.update(id, {
    dms_date: body.dms_date,
    dms_amount,
    receipt_amount,
    variance,
    status,
    reference_no: body.reference_no,
    remarks: body.remarks,
  });
  await audit.record(req, { action: 'UPDATE', entity: 'dms', entityId: id });
  req.flash('success', 'DMS deposit updated.');
  res.redirect('/dms');
};

exports.remove = async (req, res) => {
  const id = req.params.id;
  await DmsModel.remove(id);
  await audit.record(req, { action: 'DELETE', entity: 'dms', entityId: id });
  req.flash('success', 'DMS deposit deleted.');
  res.redirect('/dms');
};

exports.apiList = async (req, res) => {
  const { start, end, status } = req.query;
  res.json(await DmsModel.findAll({ ...(start && end ? { start, end } : {}), ...(status ? { status } : {}) }));
};
