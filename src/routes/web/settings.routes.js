'use strict';

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const { requireAdmin } = require('../../middleware/auth');
const ctrl = require('../../controllers/settings.controller');

const nameRule = [body('name').notEmpty().withMessage('Name is required').isLength({ max: 120 }).trim()];

// Settings is admin-only.
router.use(requireAdmin);

router.get('/', asyncHandler(ctrl.index));

// Depositors
router.post('/depositors', validate(nameRule, { redirectTo: '/settings' }), asyncHandler(ctrl.createDepositor));
router.put('/depositors/:id', validate(nameRule, { redirectTo: '/settings' }), asyncHandler(ctrl.updateDepositor));
router.delete('/depositors/:id', asyncHandler(ctrl.removeDepositor));

// Accounts
router.post('/accounts', validate(nameRule, { redirectTo: '/settings' }), asyncHandler(ctrl.createAccount));
router.put('/accounts/:id', validate(nameRule, { redirectTo: '/settings' }), asyncHandler(ctrl.updateAccount));
router.delete('/accounts/:id', asyncHandler(ctrl.removeAccount));

module.exports = router;
