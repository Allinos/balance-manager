'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const { requireAdmin } = require('../../middleware/auth');
const { createUserRules, updateUserRules } = require('../../validators/user.validator');
const ctrl = require('../../controllers/user.controller');

// All user management is admin-only.
router.use(requireAdmin);

router.get('/', asyncHandler(ctrl.list));
router.get('/new', ctrl.showCreate);
router.post('/', validate(createUserRules, { redirectTo: '/users/new' }), asyncHandler(ctrl.create));
router.get('/:id/edit', asyncHandler(ctrl.showEdit));
router.put('/:id', validate(updateUserRules, { redirectTo: (req) => `/users/${req.params.id}/edit` }), asyncHandler(ctrl.update));
router.delete('/:id', asyncHandler(ctrl.remove));

module.exports = router;
