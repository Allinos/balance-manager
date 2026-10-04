/** Authentication middleware and rate limiters. */

import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { ApiError } from './http.js';
import { verifySession } from './security.js';

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

/** Require a signed-in client (portal). Sets req.client. */
export const requireClient = (knex) => async (req, _res, next) => {
  const token = bearer(req);
  if (!token) return next(new ApiError(401, 'UNAUTHORIZED', 'Please sign in.'));
  const payload = verifySession(token, 'client');
  const client = await knex('clients').where({ id: Number(payload.sub) }).first();
  if (!client || client.token_version !== payload.tv) return next(new ApiError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.'));
  if (client.status !== 'active') return next(new ApiError(403, 'ACCOUNT_SUSPENDED', 'Your account is suspended. Please contact support.'));
  req.client = client;
  return next();
};

/**
 * Sets req.signedInClient when a valid client session is sent; never refuses the request.
 * (Not req.client: Node's request object already has a `client` property, the socket.)
 */
export const optionalClient = (knex) => async (req, _res, next) => {
  const token = bearer(req);
  if (!token) return next();
  try {
    const payload = verifySession(token, 'client');
    const client = await knex('clients').where({ id: Number(payload.sub) }).first();
    if (client && client.token_version === payload.tv && client.status === 'active') req.signedInClient = client;
  } catch {
    /* signed out or expired: continue as a visitor */
  }
  return next();
};

/** Require a signed-in admin, optionally with one of `roles`. Sets req.admin. */
export const requireAdmin = (knex, roles = null) => async (req, _res, next) => {
  const token = bearer(req);
  if (!token) return next(new ApiError(401, 'UNAUTHORIZED', 'Please sign in.'));
  const payload = verifySession(token, 'admin');
  const admin = await knex('admins').where({ id: Number(payload.sub) }).first();
  if (!admin || admin.token_version !== payload.tv) return next(new ApiError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.'));
  if (roles && !roles.includes(admin.role)) return next(new ApiError(403, 'FORBIDDEN', 'You do not have permission for this action.'));
  req.admin = admin;
  return next();
};

function limiter(windowMs, limit, message) {
  if (!config.rateLimits) return (_req, _res, next) => next();
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message } }),
  });
}

export const limits = {
  /** Login, registration, activation attempts: brute-force protection. */
  auth: limiter(15 * 60 * 1000, 30, 'Too many attempts. Please wait a few minutes and try again.'),
  /** Desktop configuration / event pings. */
  app: limiter(60 * 1000, 60, 'Too many requests. Please try again later.'),
  /** Help & Support messages from the website and the client panel (spam protection). */
  support: limiter(60 * 60 * 1000, 12, 'Too many messages sent. Please wait a while, or email us directly.'),
  /** Everything else. */
  api: limiter(60 * 1000, 600, 'Too many requests. Please slow down.'),
};
