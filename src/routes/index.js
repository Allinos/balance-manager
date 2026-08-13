'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { isAuthenticated, requireAdmin } = require('../middleware/auth');

const authRoutes = require('./auth.routes');
const dashboardCtrl = require('../controllers/dashboard.controller');
const auditCtrl = require('../controllers/audit.controller');

const collectionRoutes = require('./web/collection.routes');
const depositRoutes = require('./web/deposit.routes');
const dmsRoutes = require('./web/dms.routes');
const reportRoutes = require('./web/report.routes');
const userRoutes = require('./web/user.routes');
const settingsRoutes = require('./web/settings.routes');
const apiRoutes = require('./api');

// Public auth routes
router.use('/', authRoutes);

// Landing → dashboard
router.get('/', (req, res) => res.redirect(req.session.user ? '/dashboard' : '/login'));

// Everything below requires a session
router.use(isAuthenticated);

router.get('/dashboard', asyncHandler(dashboardCtrl.index));
router.use('/collections', collectionRoutes);
router.use('/deposits', depositRoutes);
router.use('/dms', dmsRoutes);
router.use('/reports', reportRoutes);
router.use('/users', userRoutes);
router.use('/settings', settingsRoutes);
router.get('/audit', requireAdmin, asyncHandler(auditCtrl.list));

// JSON API (session protected)
router.use('/api', apiRoutes);

module.exports = router;
