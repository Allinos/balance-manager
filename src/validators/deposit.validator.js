'use strict';

const { body } = require('express-validator');

const depositRules = [
  body('deposit_date')
    .notEmpty()
    .withMessage('Deposit date is required')
    .isISO8601()
    .withMessage('Deposit date must be a valid date'),
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isFloat({ gt: 0 })
    .withMessage('Amount must be greater than 0')
    .toFloat(),
  body('mode')
    .isIn(['Bank', 'Online', 'Cash', 'Cheque'])
    .withMessage('Invalid deposit mode'),
  body('deposited_by').optional({ values: 'falsy' }).isLength({ max: 120 }).trim(),
  body('reference_no').optional({ values: 'falsy' }).isLength({ max: 120 }).trim(),
  body('remarks').optional({ values: 'falsy' }).isLength({ max: 255 }).trim(),
];

module.exports = { depositRules };
