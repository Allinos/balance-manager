/**
 * DocGen advertisement / remote-configuration server.
 *
 *   GET  /api/app-config   → JSON configuration (edit app-config.json, no restart needed)
 *   POST /api/events       → anonymous AD_SHOWN / AD_CLICKED / AD_CLOSED counters
 *   GET  /api/stats        → event counters (protect or remove in production)
 *   GET  /ads/*.html       → static HTML ads (public/ads)
 *
 * The desktop app never sends business data. Events contain only:
 *   { event, adVersion, appVersion, os }
 */

import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const CONFIG_FILE = process.env.CONFIG_FILE || path.join(here, 'app-config.json');
const EVENTS = new Set(['AD_SHOWN', 'AD_CLICKED', 'AD_CLOSED']);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2kb' }));

// Remote configuration. Read on every request so edits apply immediately.
app.get('/api/app-config', async (_req, res) => {
  try {
    const config = JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(config);
  } catch (err) {
    console.error('Invalid config file:', err.message);
    res.status(500).json({ error: 'config unavailable' });
  }
});

// Minimal anonymous counters: { "ad-01": { AD_SHOWN: 10, AD_CLICKED: 2, ... } }
const counters = {};
app.post('/api/events', (req, res) => {
  const { event, adVersion } = req.body || {};
  if (!EVENTS.has(event)) return res.status(400).json({ error: 'unknown event' });
  const key = String(adVersion || 'unknown').slice(0, 40);
  counters[key] ??= { AD_SHOWN: 0, AD_CLICKED: 0, AD_CLOSED: 0 };
  counters[key][event] += 1;
  return res.status(204).end();
});
app.get('/api/stats', (_req, res) => res.json(counters));

// Static HTML ads. They are displayed without JavaScript, so keep them HTML + CSS.
app.use(
  '/ads',
  express.static(path.join(here, 'public/ads'), {
    maxAge: '1h',
    setHeaders: (res) => res.set('Content-Security-Policy', "script-src 'none'"),
  }),
);

app.listen(PORT, () => console.log(`DocGen ad server on http://localhost:${PORT}`));
