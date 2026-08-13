'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { loginRules } = require('../validators/user.validator');
const ctrl = require('../controllers/auth.controller');

router.get('/login', ctrl.showLogin);
router.post('/login', validate(loginRules, { redirectTo: '/login' }), asyncHandler(ctrl.login));
router.get('/logout', asyncHandler(ctrl.logout));
router.post('/logout', asyncHandler(ctrl.logout));

module.exports = router;
