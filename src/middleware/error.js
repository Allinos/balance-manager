'use strict';

const config = require('../config/env');

function notFound(req, res) {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).render('errors/404', { title: 'Not Found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error(err);
  const status = err.status || 500;

  if (req.originalUrl.startsWith('/api/')) {
    return res.status(status).json({
      error: err.message || 'Server error',
      ...(config.isProd ? {} : { stack: err.stack }),
    });
  }

  res.status(status).render('errors/500', {
    title: 'Server Error',
    message: config.isProd ? 'Something went wrong.' : err.message,
    stack: config.isProd ? null : err.stack,
  });
}

module.exports = { notFound, errorHandler };
