'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../../utils/asyncHandler');
const dashboardCtrl = require('../../controllers/dashboard.controller');
const collectionCtrl = require('../../controllers/collection.controller');
const depositCtrl = require('../../controllers/deposit.controller');
const dmsCtrl = require('../../controllers/dms.controller');

// Read-only JSON API consumed by the dashboard charts and any integrations.
router.get('/dashboard', asyncHandler(dashboardCtrl.data));
router.get('/collections', asyncHandler(collectionCtrl.apiList));
router.get('/deposits', asyncHandler(depositCtrl.apiList));
router.get('/dms', asyncHandler(dmsCtrl.apiList));

module.exports = router;
