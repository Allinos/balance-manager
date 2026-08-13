'use strict';

const bcrypt = require('bcryptjs');
const UserModel = require('../models/user.model');
const audit = require('../services/audit.service');

exports.showLogin = (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('auth/login', { title: 'Sign in', layout: 'layouts/auth' });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await UserModel.findByEmail(email);

  if (!user || !user.is_active) {
    req.flash('error', 'Invalid credentials or inactive account.');
    return res.redirect('/login');
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    req.flash('error', 'Invalid email or password.');
    return res.redirect('/login');
  }

  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  await UserModel.touchLogin(user.id);
  await audit.record(req, { action: 'LOGIN', entity: 'auth', entityId: user.id });

  const redirectTo = req.session.returnTo || '/dashboard';
  delete req.session.returnTo;
  res.redirect(redirectTo);
};

exports.logout = async (req, res) => {
  await audit.record(req, { action: 'LOGOUT', entity: 'auth', entityId: req.session.user?.id });
  req.session.destroy(() => res.redirect('/login'));
};
