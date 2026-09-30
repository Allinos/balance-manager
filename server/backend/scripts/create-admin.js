/** Create (or reset) an admin: node scripts/create-admin.js email@example.com "Strong password" [owner|admin|support] */
import { createKnex, migrate, nowIso } from '../src/db.js';
import { hashPassword } from '../src/lib/security.js';

const [email, password, role = 'owner'] = process.argv.slice(2);
if (!email || !password || password.length < 10) {
  console.error('Usage: npm run create-admin -- <email> <password (10+ chars)> [owner|admin|support]');
  process.exit(1);
}
const knex = createKnex();
await migrate(knex);
const hash = await hashPassword(password);
const existing = await knex('admins').where({ email: email.toLowerCase() }).first();
if (existing) {
  await knex('admins').where({ id: existing.id }).update({ password_hash: hash, role, token_version: existing.token_version + 1 });
  console.log(`Updated admin ${email} (${role})`);
} else {
  await knex('admins').insert({ email: email.toLowerCase(), name: email.split('@')[0], role, password_hash: hash, created_at: nowIso() });
  console.log(`Created admin ${email} (${role})`);
}
await knex.destroy();
