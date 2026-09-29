/** Start the DocGen server. */

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

const server = createApp(knex).listen(config.port, () => {
  console.log(`DocGen server listening on http://localhost:${config.port}`);
  console.log(`Database: ${config.databaseUrl ? 'MySQL' : `SQLite (${config.sqliteFile})`}`);
  console.log(`License public key (put in document-generator/src-tauri/remote-config.json → licensePublicKey): ${publicKeyB64}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => knex.destroy().then(() => process.exit(0)));
  });
}
