'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const { requireRole } = require('../../middleware/auth');
const { collectionRules } = require('../../validators/collection.validator');
const ctrl = require('../../controllers/collection.controller');

router.get('/', asyncHandler(ctrl.list));
router.get('/new', requireRole('operator'), ctrl.showCreate);
router.post('/', requireRole('operator'), validate(collectionRules, { redirectTo: '/collections/new' }), asyncHandler(ctrl.create));
router.get('/:id/edit', requireRole('operator'), asyncHandler(ctrl.showEdit));
router.put('/:id', requireRole('operator'), validate(collectionRules, { redirectTo: (req) => `/collections/${req.params.id}/edit` }), asyncHandler(ctrl.update));
router.delete('/:id', requireRole('manager'), asyncHandler(ctrl.remove));

module.exports = router;
