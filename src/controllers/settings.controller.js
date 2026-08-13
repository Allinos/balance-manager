'use strict';

const DepositorModel = require('../models/depositor.model');
const AccountModel = require('../models/account.model');
const DmsModel = require('../models/dms.model');
const audit = require('../services/audit.service');

exports.index = async (req, res) => {
  const [depositors, accounts, balancesMap] = await Promise.all([
    DepositorModel.findAll(),
    AccountModel.findAll(),
    DmsModel.totalsByAccount(),
  ]);
  const accountsWithBalance = accounts.map((a) => ({
    ...a,
    balance: balancesMap.get(a.name) || 0,
  }));
  res.render('settings/index', {
    title: 'Settings',
    active: 'settings',
    depositors,
    accounts: accountsWithBalance,
  });
};

// ---------- Depositors ----------
exports.createDepositor = async (req, res) => {
  const created = await DepositorModel.create({
    name: req.body.name,
    isActive: req.body.is_active ? 1 : 1, // active by default on create
  });
  await audit.record(req, { action: 'CREATE', entity: 'depositor', entityId: created.id, details: { name: created.name } });
  req.flash('success', 'Depositor added.');
  res.redirect('/settings');
};

exports.updateDepositor = async (req, res) => {
  await DepositorModel.update(req.params.id, {
    name: req.body.name,
    isActive: req.body.is_active ? 1 : 0,
  });
  await audit.record(req, { action: 'UPDATE', entity: 'depositor', entityId: req.params.id });
  req.flash('success', 'Depositor updated.');
  res.redirect('/settings');
};

exports.removeDepositor = async (req, res) => {
  await DepositorModel.remove(req.params.id);
  await audit.record(req, { action: 'DELETE', entity: 'depositor', entityId: req.params.id });
  req.flash('success', 'Depositor deleted.');
  res.redirect('/settings');
};

// ---------- Accounts ----------
exports.createAccount = async (req, res) => {
  const created = await AccountModel.create({ name: req.body.name });
  await audit.record(req, { action: 'CREATE', entity: 'account', entityId: created.id, details: { name: created.name } });
  req.flash('success', 'Account added.');
  res.redirect('/settings');
};

exports.updateAccount = async (req, res) => {
  await AccountModel.update(req.params.id, {
    name: req.body.name,
    isActive: req.body.is_active ? 1 : 0,
  });
  await audit.record(req, { action: 'UPDATE', entity: 'account', entityId: req.params.id });
  req.flash('success', 'Account updated.');
  res.redirect('/settings');
};

exports.removeAccount = async (req, res) => {
  await AccountModel.remove(req.params.id);
  await audit.record(req, { action: 'DELETE', entity: 'account', entityId: req.params.id });
  req.flash('success', 'Account deleted.');
  res.redirect('/settings');
};
