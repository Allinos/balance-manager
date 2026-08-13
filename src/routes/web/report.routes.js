'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../middleware/auth');
const ctrl = require('../../controllers/report.controller');

router.get('/', asyncHandler(ctrl.index));
router.get('/export/excel', requireRole('operator'), asyncHandler(ctrl.exportExcel));
router.get('/export/pdf', requireRole('operator'), asyncHandler(ctrl.exportPdf));

module.exports = router;
