/** Express application factory (used by src/index.js and the tests). */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import multer from 'multer';
import { config } from './config.js';
import { ApiError, clientIp, errorHandler } from './lib/http.js';
import { limits, requireAdmin } from './lib/auth.js';
import { appRoutes } from './routes/app.js';
import { portalRoutes, markPaid } from './routes/portal.js';
import { adminRoutes } from './routes/admin.js';
import { getProvider } from './payments/index.js';
import { audit, bumpStat, getSiteConfig } from './services/common.js';
import { pixelScript, validPixelId, withPixel } from './services/meta.js';
import { landingShell, offerShell, withShell } from './services/prerender.js';
import { cachedSitePayload } from './routes/portal.js';
import { normaliseReferralCode } from './services/referrals.js';
import { DEFAULT_PATHS, loadRenderer, robotsTxt, sitemapXml, withHead } from './services/ssr.js';
import { PLATFORMS, installerPath, isEntitled } from './services/downloads.js';
import { verifyPurposeToken } from './lib/security.js';

/**
 * @param {object} [options]
 * @param {import('vite').ViteDevServer} [options.vite] portal served live by Vite (npm run dev)
 */
export function createApp(knex, { logger = console, vite = null } = {}) {
  const app = express();
  // gzip for pages, the app's JavaScript/CSS and API answers (the app's main file shrinks from ~380 KB to ~120 KB).
  app.use(compression());
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      // Vite's live reload needs inline scripts and a websocket; the built portal does not.
      contentSecurityPolicy: vite ? false : {
        directives: {
          defaultSrc: ["'self'"],
          // Razorpay Checkout loads its script from checkout.razorpay.com and talks to *.razorpay.com;
          // the Meta Pixel loads from connect.facebook.net and reports to www.facebook.com.
          scriptSrc: ["'self'", 'https://checkout.razorpay.com', 'https://connect.facebook.net'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https://*.razorpay.com', 'https://www.facebook.com', 'https://connect.facebook.net'],
          frameSrc: ["'self'", 'https:'],
          // Product videos: YouTube / Vimeo embeds (frames) or a direct .mp4 link.
          mediaSrc: ["'self'", 'https:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          // Only when the site itself runs on HTTPS. On http://localhost some browsers (Safari) would
          // otherwise load the page's scripts over https:// — which fails and leaves a blank page.
          upgradeInsecureRequests: config.portalUrl.startsWith('https://') ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  const allowed = new Set([config.portalUrl, ...config.corsOrigins]);
  app.use('/api', cors({ origin: (origin, cb) => cb(null, !origin || allowed.has(origin)), maxAge: 600 }));
  // Keep the raw body: payment webhooks are signed over the exact bytes received.
  app.use('/api', express.json({ limit: '100kb', verify: (req, _res, buf) => (req.rawBody = buf) }));
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
    if (event.status === 'ignored') return res.json({ received: true });
    const payment = await knex('payments').where({ provider: provider.name, provider_order_id: event.providerOrderId }).first();
    if (!payment) throw new ApiError(404, 'NOT_FOUND', 'Unknown order.');
    let action = `payment.webhook.${event.status}`;
    if (event.status === 'paid' && event.amountPaise != null && Number(event.amountPaise) !== Number(payment.amount_paise)) {
      // Never issue a license for less than the plan price; an admin can still confirm it manually.
      action = 'payment.webhook.amount_mismatch';
    } else if (event.status === 'paid') {
      await markPaid(knex, payment, event.providerPaymentId, event.meta);
    } else if (payment.status !== 'paid') {
      await knex('payments').where({ id: payment.id }).update({ status: 'failed', updated_at: new Date().toISOString() });
    }
    await audit(knex, {
      actorType: 'system',
      action,
      entity: 'payment',
      entityId: payment.id,
      details: { amountPaise: event.amountPaise ?? null, ...event.meta },
      ip: clientIp(req),
    });
    return res.json({ received: true });
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

  /** Personal installer link (website or purchase email). A browser download, so the token is in the URL. */
  app.get('/api/downloads/:token', async (req, res) => {
    const link = verifyPurposeToken(req.params.token, 'download');
    const file = link && PLATFORMS[link.p] ? installerPath(link.p) : '';
    if (!file || !(await isEntitled(knex, Number(link.sub)))) return res.redirect(302, '/account?download=expired');
    const fileName = path.basename(file);
    await bumpStat(knex, `download:${link.p}`);
    await audit(knex, { actorType: 'client', actorId: Number(link.sub), action: 'download', entity: 'download', details: { platform: link.p, fileName }, ip: clientIp(req) });
    return res.download(file, fileName, { headers: { 'Cache-Control': 'private, no-store' } });
  });

  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Unknown API endpoint.')));

  // DocGen Mobile: the installable web app (PWA) for phones, with its own scope /app/.
  const mobileIndex = path.join(config.mobileDist, 'index.html');
  if (fs.existsSync(mobileIndex)) {
    // The app's scope is /app/ (with the slash); Express treats /app and /app/ alike, so compare the raw URL.
    app.use((req, res, next) => (req.method === 'GET' && /^\/app(\?|$)/.test(req.originalUrl) ? res.redirect(301, req.originalUrl.replace(/^\/app/, '/app/')) : next()));
    app.use(
      '/app',
      express.static(config.mobileDist, {
        index: false,
        setHeaders: (res, file) => {
          // Hashed build files never change; everything else (service worker, manifest, icons) is revalidated.
          res.set('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
    app.get(/^\/app\/.*/, (_req, res) => res.sendFile(mobileIndex, { headers: { 'Cache-Control': 'no-cache' } }));
  }

  /** The website's own address: PORTAL_URL, or the address this request came to when that is still localhost. */
  const baseUrl = (req) => (/\/\/(localhost|127\.0\.0\.1)(:|$)/.test(config.portalUrl) ? `${req.protocol}://${req.get('host')}` : config.portalUrl);
  // For search engines and AI assistants: what may be read, and the list of public pages.
  // Referral links (services/referrals.js): /r/48213 → the home page with ?ref=48213; the website keeps the code
  // for 30 days and sends it with sign-up and checkout. Unknown codes are simply ignored there.
  app.get('/r/:code', (req, res) => {
    const code = normaliseReferralCode(req.params.code);
    res.set('X-Robots-Tag', 'noindex').set('Cache-Control', 'no-store');
    res.redirect(302, code ? `/?ref=${encodeURIComponent(code)}` : '/');
  });
  app.get('/robots.txt', (req, res) => res.set('Cache-Control', 'public, max-age=3600').type('text/plain').send(robotsTxt(baseUrl(req))));
  app.get('/sitemap.xml', async (req, res) => {
    const renderer = vite ? null : await loadRenderer(config.portalDist);
    res.set('Cache-Control', 'public, max-age=3600').type('application/xml').send(sitemapXml(baseUrl(req), renderer?.INDEXED_PATHS || DEFAULT_PATHS));
  });

  // React client portal + admin panel (single-page app), on the same port as the API.
  if (vite) {
    app.use(vite.middlewares);
  } else if (fs.existsSync(path.join(config.portalDist, 'index.html'))) {
    const indexHtml = fs.readFileSync(path.join(config.portalDist, 'index.html'), 'utf8');
    /** The Meta Pixel (Admin → Website) when it is on and has an ID; never on the admin panel. */
    const pixelFor = async (reqPath) => {
      if (reqPath.startsWith('/admin')) return null;
      const pixel = (await getSiteConfig(knex)).metaPixel || {};
      return pixel.enabled !== false && validPixelId(pixel.pixelId) ? pixel.pixelId : null;
    };
    // Meta Pixel base code as a file, so it runs under the Content-Security-Policy (no inline scripts).
    app.get('/meta-pixel.js', async (_req, res) => {
      const id = await pixelFor('/');
      res.set('Cache-Control', 'no-cache').type('application/javascript').send(id ? pixelScript(id) : '/* Meta Pixel is off */\n');
    });
    // redirect: false — a folder such as img/ never turns a page address into a folder redirect.
    // Built files have a content hash in their name (assets/index-AbC123.js): the browser keeps them for a year.
    app.use('/assets', express.static(path.join(config.portalDist, 'assets'), { index: false, redirect: false, maxAge: '365d', immutable: true }));
    app.use(express.static(config.portalDist, { index: false, redirect: false, maxAge: '1h' }));
    // Every page of the single-page app gets index.html, with the Pixel in the HTML itself so Meta's tools see it.
    // The public pages (/, /buy, /mobile, /support, /contact, the policies, /offer …) come with their whole content
    // rendered in (services/ssr.js) plus the page data, so they show before the app loads and can be read without
    // JavaScript. The account and admin panels show "Loading…" until the app starts.
    const renderer = loadRenderer(config.portalDist);
    app.get(/^(?!\/api\/).*/, async (req, res) => {
      const id = await pixelFor(req.path);
      // The ad offer page is for ad visitors only: keep it out of search results; panels too.
      const noindex = req.path === '/offer' || req.path.startsWith('/admin') || req.path.startsWith('/account');
      if (noindex) res.set('X-Robots-Tag', 'noindex, nofollow');
      let html = withShell(indexHtml, '', null);
      if (!req.path.startsWith('/admin') && !req.path.startsWith('/account')) {
        try {
          const payload = await cachedSitePayload(knex);
          const offerOff = req.path === '/offer' && payload.site?.offer?.enabled === false;
          let page = null;
          try {
            page = offerOff ? null : (await renderer)?.render(req.originalUrl, payload);
          } catch (e) {
            logger.warn?.({ err: e.message, path: req.path }, 'page could not be rendered on the server');
          }
          const canonical = `${baseUrl(req)}${req.path === '/' ? '/' : req.path.replace(/\/+$/, '')}`;
          if (page) html = withHead(withShell(indexHtml, page.html, payload), { ...page, canonical, noindex: noindex || !page.index });
          else if (req.path === '/' || req.path === '/offer') {
            // Renderer not built: the first screen only (headline, price, button).
            const shell = req.path === '/' ? landingShell(payload) : offerOff ? '' : offerShell(payload);
            html = withShell(indexHtml, shell, payload);
          }
        } catch {
          /* the plain "Loading…" page; the app loads its data itself */
        }
      }
      res.set('Cache-Control', 'no-cache').type('html').send(id ? withPixel(html, id) : html);
    });
  }

  app.use(errorHandler(logger));
  return app;
}
