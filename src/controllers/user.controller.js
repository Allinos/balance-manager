'use strict';

const bcrypt = require('bcryptjs');
const UserModel = require('../models/user.model');
const audit = require('../services/audit.service');

exports.list = async (req, res) => {
  const users = await UserModel.findAll();
  res.render('users/list', { title: 'Users', active: 'users', users });
};

exports.showCreate = (req, res) => {
  res.render('users/form', {
    title: 'Add User',
    active: 'users',
    user: { role: 'operator', is_active: 1 },
    formAction: '/users',
    isEdit: false,
  });
};

exports.create = async (req, res) => {
  const { name, email, role, password } = req.body;
  const isActive = req.body.is_active ? 1 : 0;

  const existing = await UserModel.findByEmail(email);
  if (existing) {
    req.flash('error', 'A user with that email already exists.');
    return res.redirect('/users/new');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await UserModel.create({ name, email, passwordHash, role, isActive });
  await audit.record(req, { action: 'CREATE', entity: 'user', entityId: created.id, details: { email, role } });
  req.flash('success', 'User created.');
  res.redirect('/users');
};

exports.showEdit = async (req, res) => {
  const user = await UserModel.findById(req.params.id);
  if (!user) {
    req.flash('error', 'User not found.');
    return res.redirect('/users');
  }
  res.render('users/form', {
    title: 'Edit User',
    active: 'users',
    user,
    formAction: `/users/${user.id}?_method=PUT`,
    isEdit: true,
  });
};

exports.update = async (req, res) => {
  const id = req.params.id;
  const { name, email, role } = req.body;
  const isActive = req.body.is_active ? 1 : 0;
  await UserModel.update(id, { name, email, role, isActive });

  if (req.body.password) {
    const passwordHash = await bcrypt.hash(req.body.password, 10);
    await UserModel.updatePassword(id, passwordHash);
  }

  await audit.record(req, { action: 'UPDATE', entity: 'user', entityId: id });
  req.flash('success', 'User updated.');
  res.redirect('/users');
};

exports.remove = async (req, res) => {
  const id = String(req.params.id);
  if (id === String(req.session.user.id)) {
    req.flash('error', 'You cannot delete your own account.');
    return res.redirect('/users');
  }
  await UserModel.remove(id);
  await audit.record(req, { action: 'DELETE', entity: 'user', entityId: id });
  req.flash('success', 'User deleted.');
  res.redirect('/users');
};
