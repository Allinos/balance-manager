/** Express application factory (used by src/index.js and the tests). */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import multer from 'multer';
import { config } from './config.js';
import { ApiError, clientIp, errorHandler } from './lib/http.js';
import { limits, requireAdmin } from './lib/auth.js';
import { appRoutes } from './routes/app.js';
import { portalRoutes, markPaid } from './routes/portal.js';
import { adminRoutes } from './routes/admin.js';
import { getProvider } from './payments/index.js';
import { audit } from './services/common.js';

/**
 * @param {object} [options]
 * @param {import('vite').ViteDevServer} [options.vite] portal served live by Vite (npm run dev)
 */
export function createApp(knex, { logger = console, vite = null } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      // Vite's live reload needs inline scripts and a websocket; the built portal does not.
      contentSecurityPolicy: vite ? false : {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          frameSrc: ["'self'", 'https:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  const allowed = new Set([config.portalUrl, ...config.corsOrigins]);
  app.use('/api', cors({ origin: (origin, cb) => cb(null, !origin || allowed.has(origin)), maxAge: 600 }));
  app.use('/api', express.json({ limit: '100kb' }));
  app.use('/api', limits.api);

  app.get('/api/health', async (_req, res) => {
    await knex.raw('select 1');
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.use('/api/app', appRoutes(knex));
  app.use('/api/portal', portalRoutes(knex));
  app.use('/api/admin', adminRoutes(knex));

  /** Server-to-server payment notifications from a provider. */
  app.post('/api/payments/webhook/:provider', async (req, res) => {
    const provider = getProvider(req.params.provider);
    const event = await provider.parseWebhook(req);
    const payment = await knex('payments').where({ provider: provider.name, provider_order_id: event.providerOrderId }).first();
    if (!payment) throw new ApiError(404, 'NOT_FOUND', 'Unknown order.');
    if (event.status === 'paid') {
      await markPaid(knex, payment, event.providerPaymentId, event.meta);
    } else if (payment.status !== 'paid') {
      await knex('payments').where({ id: payment.id }).update({ status: 'failed', updated_at: new Date().toISOString() });
    }
    await audit(knex, { actorType: 'system', action: `payment.webhook.${event.status}`, entity: 'payment', entityId: payment.id, ip: clientIp(req) });
    res.json({ received: true });
  });

  // Ad images uploaded by admins (served publicly, 2 MB, images only).
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: config.uploadsDir,
      filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '')}`),
    }),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpeg|webp|gif)$/.test(file.mimetype)),
  });
  app.post('/api/admin/uploads', requireAdmin(knex), upload.single('file'), (req, res) => {
    if (!req.file) throw new ApiError(400, 'INVALID_FILE', 'Please upload a PNG, JPG, WEBP or GIF image up to 2 MB.');
    res.status(201).json({ url: `${config.portalUrl}/uploads/${req.file.filename}` });
  });
  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d', fallthrough: false }));

  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Unknown API endpoint.')));

  // React client portal + admin panel (single-page app), on the same port as the API.
  if (vite) {
    app.use(vite.middlewares);
  } else if (fs.existsSync(path.join(config.portalDist, 'index.html'))) {
    app.use(express.static(config.portalDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(config.portalDist, 'index.html')));
  }

  app.use(errorHandler(logger));
  return app;
}
