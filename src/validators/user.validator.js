'use strict';

const { body } = require('express-validator');

const createUserRules = [
  body('name').notEmpty().withMessage('Name is required').isLength({ max: 120 }).trim(),
  body('email').notEmpty().withMessage('Email is required').isEmail().withMessage('Invalid email')
    .normalizeEmail(),
  body('role').isIn(['admin', 'manager', 'operator', 'viewer']).withMessage('Invalid role'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
];

const updateUserRules = [
  body('name').notEmpty().withMessage('Name is required').isLength({ max: 120 }).trim(),
  body('email').notEmpty().withMessage('Email is required').isEmail().withMessage('Invalid email')
    .normalizeEmail(),
  body('role').isIn(['admin', 'manager', 'operator', 'viewer']).withMessage('Invalid role'),
];

const loginRules = [
  body('email').notEmpty().withMessage('Email is required').isEmail().withMessage('Invalid email'),
  body('password').notEmpty().withMessage('Password is required'),
];

module.exports = { createUserRules, updateUserRules, loginRules };
