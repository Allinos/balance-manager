'use strict';

const CollectionModel = require('../models/collection.model');
const { computeTotal, recalculateAll, buildLedger } = require('../services/ledger.service');
const audit = require('../services/audit.service');
const { round2 } = require('../utils/money');
const { todayISO } = require('../utils/date');

exports.list = async (req, res) => {
  const { start, end } = req.query;
  const ledger = await buildLedger(start && end ? { start, end } : {});
  res.render('collections/list', {
    title: 'Daily Collections',
    active: 'collections',
    collections: [...ledger].reverse(),
    filters: { start: start || '', end: end || '' },
  });
};

exports.showCreate = (req, res) => {
  res.render('collections/form', {
    title: 'Add Collection',
    active: 'collections',
    collection: { collection_date: todayISO() },
    formAction: '/collections',
    isEdit: false,
  });
};

exports.create = async (req, res) => {
  const body = req.body;
  const online = round2(body.online || 0);
  const cash = round2(body.cash || 0);
  const credit_balance = round2(body.credit_balance || 0);
  const total_collection = computeTotal({ online, cash, credit_balance });

  const existing = await CollectionModel.findByDate(body.collection_date);
  if (existing) {
    req.flash('error', `A collection for ${body.collection_date} already exists.`);
    return res.redirect('/collections');
  }

  const created = await CollectionModel.create({
    collection_date: body.collection_date,
    online,
    cash,
    credit_balance,
    total_collection,
    old_balance_collection: round2(body.old_balance_collection || 0),
    opening_balance: 0,
    remaining_balance: 0,
    available_cash: 0,
    remarks: body.remarks,
    created_by: req.session.user.id,
  });

  await recalculateAll();
  await audit.record(req, {
    action: 'CREATE', entity: 'collection', entityId: created.id, details: { collection_date: created.collection_date },
  });

  req.flash('success', 'Collection added.');
  res.redirect('/collections');
};

exports.showEdit = async (req, res) => {
  const collection = await CollectionModel.findById(req.params.id);
  if (!collection) {
    req.flash('error', 'Collection not found.');
    return res.redirect('/collections');
  }
  res.render('collections/form', {
    title: 'Edit Collection',
    active: 'collections',
    collection,
    formAction: `/collections/${collection.id}?_method=PUT`,
    isEdit: true,
  });
};

exports.update = async (req, res) => {
  const id = req.params.id;
  const current = await CollectionModel.findById(id);
  if (!current) {
    req.flash('error', 'Collection not found.');
    return res.redirect('/collections');
  }
  const body = req.body;
  const online = round2(body.online || 0);
  const cash = round2(body.cash || 0);
  const credit_balance = round2(body.credit_balance || 0);
  const total_collection = computeTotal({ online, cash, credit_balance });

  await CollectionModel.update(id, {
    collection_date: body.collection_date,
    online,
    cash,
    credit_balance,
    total_collection,
    old_balance_collection: round2(body.old_balance_collection || 0),
    remarks: body.remarks,
    updated_by: req.session.user.id,
  });

  await recalculateAll();
  await audit.record(req, { action: 'UPDATE', entity: 'collection', entityId: id });

  req.flash('success', 'Collection updated.');
  res.redirect('/collections');
};

exports.remove = async (req, res) => {
  const id = req.params.id;
  await CollectionModel.remove(id);
  await recalculateAll();
  await audit.record(req, { action: 'DELETE', entity: 'collection', entityId: id });
  req.flash('success', 'Collection deleted.');
  res.redirect('/collections');
};

// ---- JSON API ----
exports.apiList = async (req, res) => {
  const { start, end } = req.query;
  const ledger = await buildLedger(start && end ? { start, end } : {});
  res.json(ledger);
};
