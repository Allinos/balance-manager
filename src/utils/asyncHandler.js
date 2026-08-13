'use strict';

/**
 * Wraps an async route handler so rejected promises are
 * forwarded to Express' error middleware instead of crashing.
 */
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
