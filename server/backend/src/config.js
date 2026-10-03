/**
 * Server configuration from environment variables.
 *
 *   PORT                    HTTP port (default 8787)
 *   NODE_ENV                'production' enables strict checks
 *   DATABASE_URL            mysql://user:pass@host:3306/docgen  (MySQL 8, recommended in production)
 *   DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME   the same as separate settings (no URL encoding needed)
 *   SQLITE_FILE             SQLite file used when DATABASE_URL is not set (default server/data/docgen.sqlite)
 *   JWT_SECRET              secret for portal/admin sessions (required in production)
 *   LICENSE_PRIVATE_KEY     Ed25519 private key (PEM) used to sign desktop license tokens
 *   ADMIN_EMAIL / ADMIN_PASSWORD   bootstrap admin created on first start if no admin exists
 *   PORTAL_URL              public URL of the client portal (used in links)
 *   CORS_ORIGINS            comma-separated extra allowed origins
 *   ENABLE_MOCK_PAYMENTS    'true' to allow the built-in test payment provider (default: off — anyone could get a free license)
 *   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET   Razorpay payments (card, UPI, netbanking, wallets)
 *   SMTP_URL                smtps://user:pass@smtp.example.com:465 — emails (password reset, payment receipt)
 *   MAIL_FROM               sender, e.g. "DocGen <no-reply@reynrel.in>"
 *   SUPPORT_EMAIL           shown to customers (default support@reynrel.in)
 *   TRUST_PROXY             'true' when running behind Nginx/Caddy/a load balancer
 *   DATA_DIR                folder for keys, uploads and the SQLite file (default server/data)
 *   PORTAL_DEV              'true' to serve the frontend live from frontend/src with Vite (set by npm run dev)
 *
 * Settings are read from server/.env (or server/backend/.env). Relative paths are relative to server/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** server/backend */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** server/ — holds .env, data/ and the frontend */
const serverRoot = path.resolve(root, '..');

const envFiles = [];

/** Load a .env file (KEY=value lines) if present. Real environment variables and earlier files win. */
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  envFiles.push(file);
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
if (process.env.NODE_ENV !== 'test') {
  loadDotEnv(path.join(serverRoot, '.env'));
  loadDotEnv(path.join(root, '.env'));
}

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const dataDir = path.resolve(serverRoot, env.DATA_DIR || 'data');

export const config = {
  root,
  serverRoot,
  isProd,
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT || 8787),
  dataDir,
  /** .env files that were read (shown in startup errors). */
  envFiles,
  databaseUrl: env.DATABASE_URL || '',
  /** MySQL as separate settings — used when DATABASE_URL is empty and DB_NAME is set. */
  db: env.DB_NAME
    ? { host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 3306), user: env.DB_USER || 'root', password: env.DB_PASSWORD || '', database: env.DB_NAME }
    : null,
  sqliteFile: path.resolve(serverRoot, env.SQLITE_FILE || path.join(dataDir, 'docgen.sqlite')),
  jwtSecret: env.JWT_SECRET || '',
  licensePrivateKey: env.LICENSE_PRIVATE_KEY || '',
  adminEmail: env.ADMIN_EMAIL || '',
  adminPassword: env.ADMIN_PASSWORD || '',
  portalUrl: (env.PORTAL_URL || `http://localhost:${env.PORT || 8787}`).replace(/\/$/, ''),
  corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  // Off unless explicitly enabled: with it on, anyone can "pay" with the test provider and get a real license.
  enableMockPayments: env.ENABLE_MOCK_PAYMENTS === 'true' && !isProd,
  razorpay: {
    keyId: env.RAZORPAY_KEY_ID || '',
    keySecret: env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
    apiBase: (env.RAZORPAY_API_BASE || 'https://api.razorpay.com').replace(/\/$/, ''),
  },
  smtpUrl: env.SMTP_URL || '',
  mailFrom: env.MAIL_FROM || 'DocGen <no-reply@reynrel.in>',
  supportEmail: env.SUPPORT_EMAIL || 'support@reynrel.in',
  trustProxy: env.TRUST_PROXY === 'true',
  uploadsDir: path.join(dataDir, 'uploads'),
  /** Installers customers download after paying (one per platform). */
  downloadsDir: path.join(dataDir, 'downloads'),
  portalDir: path.join(serverRoot, 'frontend'),
  portalDist: path.resolve(serverRoot, env.PORTAL_DIST || 'frontend/dist'),
  portalDev: env.PORTAL_DEV === 'true' || process.argv.includes('--dev'),
  /** DocGen Mobile (installable web app), served at /app/. */
  mobileDist: path.resolve(serverRoot, env.MOBILE_DIST || 'mobile/dist'),
  /** Disable rate limits in automated tests unless explicitly re-enabled. */
  rateLimits: env.RATE_LIMITS ? env.RATE_LIMITS !== 'off' : env.NODE_ENV !== 'test',
};
