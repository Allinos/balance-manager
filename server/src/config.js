/**
 * Server configuration from environment variables.
 *
 *   PORT                    HTTP port (default 8787)
 *   NODE_ENV                'production' enables strict checks
 *   DATABASE_URL            postgres://user:pass@host:5432/db  (PostgreSQL, recommended in production)
 *   SQLITE_FILE             SQLite file used when DATABASE_URL is not set (default ./data/docgen.sqlite)
 *   JWT_SECRET              secret for portal/admin sessions (required in production)
 *   LICENSE_PRIVATE_KEY     Ed25519 private key (PEM) used to sign desktop license tokens
 *   ADMIN_EMAIL / ADMIN_PASSWORD   bootstrap admin created on first start if no admin exists
 *   PORTAL_URL              public URL of the client portal (used in links)
 *   CORS_ORIGINS            comma-separated extra allowed origins
 *   ENABLE_MOCK_PAYMENTS    'true' to allow the built-in test payment provider (default: on outside production)
 *   TRUST_PROXY             'true' when running behind Nginx/Caddy/a load balancer
 *   DATA_DIR                folder for keys, uploads and the SQLite file (default ./data)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const isProd = env.NODE_ENV === 'production';
const dataDir = path.resolve(root, env.DATA_DIR || 'data');

export const config = {
  root,
  isProd,
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT || 8787),
  dataDir,
  databaseUrl: env.DATABASE_URL || '',
  sqliteFile: path.resolve(root, env.SQLITE_FILE || path.join(dataDir, 'docgen.sqlite')),
  jwtSecret: env.JWT_SECRET || '',
  licensePrivateKey: env.LICENSE_PRIVATE_KEY || '',
  adminEmail: env.ADMIN_EMAIL || '',
  adminPassword: env.ADMIN_PASSWORD || '',
  portalUrl: (env.PORTAL_URL || `http://localhost:${env.PORT || 8787}`).replace(/\/$/, ''),
  corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  enableMockPayments: env.ENABLE_MOCK_PAYMENTS ? env.ENABLE_MOCK_PAYMENTS === 'true' : !isProd,
  trustProxy: env.TRUST_PROXY === 'true',
  uploadsDir: path.join(dataDir, 'uploads'),
  portalDist: path.resolve(root, env.PORTAL_DIST || '../portal/dist'),
  /** Disable rate limits in automated tests unless explicitly re-enabled. */
  rateLimits: env.RATE_LIMITS ? env.RATE_LIMITS !== 'off' : env.NODE_ENV !== 'test',
};
