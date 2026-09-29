/**
 * Seed many clients, licenses and devices for performance testing.
 *   npm run seed:load -- 10000          (uses DATABASE_URL or the SQLite file from .env / defaults)
 * Every seeded client uses the password "load-test-password" and an e-mail ending in @load.test.
 */
import { pathToFileURL } from 'node:url';
import { createKnex, migrate, nowIso } from '../src/db.js';
import { generateActivationCode, hashPassword } from '../src/lib/security.js';
import { seedDefaults } from '../src/services/common.js';

const STATES = ['Maharashtra', 'Karnataka', 'Gujarat', 'Tamil Nadu', 'Delhi', 'Uttar Pradesh', 'West Bengal', 'Rajasthan'];

export async function seedLoad(knex, { clients = 10000, batch = 500 } = {}) {
  await seedDefaults(knex);
  const plans = await knex('plans').select('id', 'max_devices', 'duration_days');
  const hash = await hashPassword('load-test-password');
  const codes = new Set((await knex('licenses').select('code')).map((r) => r.code));
  const t0 = Date.now();
  const ts = nowIso();
  const start = Number((await knex('clients').max({ m: 'id' }))[0].m || 0);
  for (let offset = 0; offset < clients; offset += batch) {
    const n = Math.min(batch, clients - offset);
    const rows = Array.from({ length: n }, (_, i) => {
      const k = start + offset + i + 1;
      return {
        email: `client${k}@load.test`, password_hash: hash, name: `Client ${k}`, phone: `9${String(k).padStart(9, '0')}`,
        business_name: `Business ${k} Traders`, state: STATES[k % STATES.length], source: 'admin', created_at: ts, updated_at: ts,
      };
    });
    await knex.transaction(async (trx) => {
      await trx('clients').insert(rows);
      // Look the ids up by e-mail (MySQL returns only the first id of a multi-row insert).
      const byEmail = new Map((await trx('clients').whereIn('email', rows.map((r) => r.email)).select('id', 'email')).map((r) => [r.email, r.id]));
      const ids = rows.map((r) => byEmail.get(r.email));
      const licenses = ids.map((clientId, i) => {
        const plan = plans[(offset + i) % plans.length];
        let code;
        do code = generateActivationCode();
        while (codes.has(code));
        codes.add(code);
        const active = (offset + i) % 4 !== 0;
        return {
          code, client_id: clientId, plan_id: plan.id, status: active ? 'active' : 'unused', duration_days: plan.duration_days,
          max_devices: plan.max_devices, activated_at: active ? ts : null,
          expires_at: active && plan.duration_days ? new Date(Date.now() + plan.duration_days * 86400000).toISOString() : null,
          source: 'bulk', created_at: ts, updated_at: ts,
        };
      });
      await trx('licenses').insert(licenses);
      const byCode = new Map((await trx('licenses').whereIn('code', licenses.map((l) => l.code)).select('id', 'code')).map((r) => [r.code, r.id]));
      const licIds = licenses.map((l) => byCode.get(l.code));
      const devices = licIds
        .filter((_, i) => licenses[i].status === 'active')
        .map((licenseId) => ({ license_id: licenseId, device_id: `dg-load-${licenseId}`, device_name: 'Load PC', platform: 'windows', app_version: '1.1.0', activated_at: ts, last_seen_at: ts }));
      if (devices.length) await trx('devices').insert(devices);
    });
  }
  return { clients, ms: Date.now() - t0 };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const count = Number(process.argv[2] || 10000);
  const knex = createKnex();
  await migrate(knex);
  const r = await seedLoad(knex, { clients: count });
  console.log(`Seeded ${r.clients} clients with licenses and devices in ${r.ms} ms`);
  await knex.destroy();
}
