'use strict';

const { validationResult } = require('express-validator');

/**
 * Runs an array of express-validator chains, then either continues or
 * re-renders the form with flash errors. For API routes it returns JSON.
 */
function validate(chains, { redirectTo } = {}) {
  return async (req, res, next) => {
    await Promise.all(chains.map((c) => c.run(req)));
    const result = validationResult(req);
    if (result.isEmpty()) return next();

    const errors = result.array();

    if (req.originalUrl.startsWith('/api/')) {
      return res.status(422).json({ errors });
    }

    // Flash the first message per field and bounce back.
    req.flash('error', errors.map((e) => e.msg).join(' • '));
    req.flash('formData', JSON.stringify(req.body));
    const back = typeof redirectTo === 'function' ? redirectTo(req) : redirectTo;
    return res.redirect(back || req.get('Referer') || '/');
  };
}

module.exports = validate;
