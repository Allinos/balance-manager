/** Start the DocGen server: API, client portal and admin panel on one port. */

import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { createKnex, migrate, nowIso } from './db.js';
import { createApp } from './app.js';
import { hashPassword, loadLicenseKeys } from './lib/security.js';
import { seedDefaults } from './services/common.js';

async function bootstrapAdmin(knex) {
  const [{ count }] = await knex('admins').count({ count: '*' });
  if (Number(count) > 0) return;
  if (!config.adminEmail || !config.adminPassword) {
    console.warn('No admin account exists. Set ADMIN_EMAIL and ADMIN_PASSWORD and restart, or run: npm run create-admin');
    return;
  }
  await knex('admins').insert({
    email: config.adminEmail.toLowerCase(),
    name: 'Owner',
    role: 'owner',
    password_hash: await hashPassword(config.adminPassword),
    created_at: nowIso(),
  });
  console.log(`Created owner admin ${config.adminEmail}`);
}

const knex = createKnex();
await migrate(knex);
await seedDefaults(knex);
await bootstrapAdmin(knex);
const { publicKeyB64 } = loadLicenseKeys();

const server = http.createServer();
let vite = null;
if (config.portalDev) {
  // Live portal (npm run dev): Vite runs inside this server, its reload socket shares the port.
  // The config is passed inline (configFile: false) so Vite writes no temporary files for `node --watch` to see.
  const { createServer } = await import('vite');
  const { default: portalConfig } = await import(pathToFileURL(path.join(config.portalDir, 'vite.config.js')).href);
  vite = await createServer({
    ...portalConfig,
    configFile: false,
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  });
}
server.on('request', createApp(knex, { vite }));
server.listen(config.port, () => {
  console.log(`DocGen server listening on http://localhost:${config.port}`);
  console.log(`Portal: http://localhost:${config.port}/ · Admin: http://localhost:${config.port}/admin${vite ? ' (live reload)' : ''}`);
  console.log(`Database: ${config.databaseUrl ? 'MySQL' : `SQLite (${config.sqliteFile})`}`);
  console.log(`License public key (put in document-generator/src-tauri/remote-config.json → licensePublicKey): ${publicKeyB64}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => Promise.all([knex.destroy(), vite?.close()]).then(() => process.exit(0)));
  });
}
