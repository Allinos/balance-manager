'use strict';

const { body } = require('express-validator');

const dmsRules = [
  body('dms_date')
    .notEmpty()
    .withMessage('DMS date is required')
    .isISO8601()
    .withMessage('DMS date must be a valid date'),
  body('dms_amount')
    .notEmpty()
    .withMessage('DMS amount is required')
    .isFloat({ min: 0 })
    .withMessage('DMS amount must be a number ≥ 0')
    .toFloat(),
  body('receipt_amount')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Receipt amount must be a number ≥ 0')
    .toFloat(),
  body('reference_no').optional({ values: 'falsy' }).isLength({ max: 120 }).trim(),
  body('remarks').optional({ values: 'falsy' }).isLength({ max: 255 }).trim(),
];

module.exports = { dmsRules };
