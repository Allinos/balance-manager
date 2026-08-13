'use strict';

const { body } = require('express-validator');

const money = (field, label) =>
  body(field)
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage(`${label} must be a number ≥ 0`)
    .toFloat();

const collectionRules = [
  body('collection_date')
    .notEmpty()
    .withMessage('Collection date is required')
    .isISO8601()
    .withMessage('Collection date must be a valid date'),
  money('online', 'Online'),
  money('cash', 'Cash'),
  money('credit_balance', 'Credit balance'),
  money('old_balance_collection', 'Old balance collection'),
  body('remarks').optional({ values: 'falsy' }).isLength({ max: 255 }).trim(),
];

module.exports = { collectionRules };
