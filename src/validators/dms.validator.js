'use strict';

const { body } = require('express-validator');

const dmsRules = [
  body('dms_date')
    .notEmpty()
    .withMessage('Date is required')
    .isISO8601()
    .withMessage('Date must be valid'),
  body('payment_mode')
    .isIn(['Cash', 'Online'])
    .withMessage('Payment mode must be Cash or Online'),
  body('account').optional({ values: 'falsy' }).isLength({ max: 120 }).trim(),
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isFloat({ gt: 0 })
    .withMessage('Amount must be greater than 0')
    .toFloat(),
  body('status')
    .isIn(['pending', 'on_hold', 'completed'])
    .withMessage('Invalid status'),
  body('deposited_by').optional({ values: 'falsy' }).isLength({ max: 120 }).trim(),
  body('remarks').optional({ values: 'falsy' }).isLength({ max: 255 }).trim(),
];

module.exports = { dmsRules };
