/**
 * Basic load / performance test of the DocGen server.
 *
 *   npm run loadtest                       fresh temporary SQLite database
 *   DATABASE_URL=postgres://… npm run loadtest   (uses and seeds that database — use a test database!)
 *   LOAD_CLIENTS=20000 npm run loadtest
 *
 * Seeds clients + licenses + devices, then measures latency (p50/p95/max) and
 * throughput of the endpoints that matter at scale. Rate limits are disabled
 * for the run (they are covered by test/ratelimit.test.js).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.RATE_LIMITS = 'off';
if (!process.env.DATABASE_URL) process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'docgen-load-'));

const { createKnex, migrate } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { hashPassword } = await import('../src/lib/security.js');
const { seedLoad } = await import('./seed-load.js');

const CLIENTS = Number(process.env.LOAD_CLIENTS || 10000);
const knex = createKnex();
await migrate(knex);
const seeded = await seedLoad(knex, { clients: CLIENTS });
await knex('admins').insert({ email: 'load-admin@load.test', name: 'Load', role: 'owner', password_hash: await hashPassword('load-admin-pass'), created_at: new Date().toISOString() }).onConflict('email').ignore();
const server = createApp(knex, { logger: { error() {} } }).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const post = (url, body, token) =>
  fetch(`${base}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const get = (url, token) => fetch(`${base}${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

async function bench(name, total, concurrency, fn) {
  const times = [];
  let errors = 0;
  let next = 0;
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < total) {
        const i = next;
        next += 1;
        const s = performance.now();
        try {
          const res = await fn(i);
          if (!res.ok) errors += 1;
          await res.arrayBuffer();
        } catch {
          errors += 1;
        }
        times.push(performance.now() - s);
      }
    }),
  );
  const wall = performance.now() - t0;
  times.sort((a, b) => a - b);
  const pct = (p) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))].toFixed(1);
  const row = { name, requests: total, concurrency, rps: Math.round((total / wall) * 1000), p50: pct(50), p95: pct(95), max: times.at(-1).toFixed(1), errors };
  console.log(`${name.padEnd(42)} ${String(row.rps).padStart(6)} req/s   p50 ${row.p50.padStart(6)} ms   p95 ${row.p95.padStart(6)} ms   max ${row.max.padStart(7)} ms   errors ${errors}`);
  return row;
}

console.log(`Database: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite'} — seeded ${seeded.clients} clients/licenses in ${seeded.ms} ms\n`);
const admin = await (await post('/api/admin/auth/login', { email: 'load-admin@load.test', password: 'load-admin-pass' })).json();
const token = admin.token;
const unused = await knex('licenses').where({ status: 'unused' }).limit(300).select('code');
const rows = [];
rows.push(await bench('GET /api/app/config (desktop check)', 3000, 50, () => get('/api/app/config?platform=windows&version=1.1.0')));
rows.push(await bench('POST /api/app/events (ad counters)', 3000, 50, () => post('/api/app/events', { event: 'AD_SHOWN', adId: 1 })));
rows.push(await bench('POST /api/app/activate (code, new device)', unused.length, 20, (i) =>
  post('/api/app/activate', { code: unused[i].code, deviceId: `dg-bench-${i}-0123456789abcdef`, deviceName: 'Bench PC', platform: 'windows', appVersion: '1.1.0' })));
// Sign-in from the computer already registered on each license (bcrypt dominates the cost by design).
const signIns = await knex('devices').join('licenses', 'licenses.id', 'devices.license_id').join('clients', 'clients.id', 'licenses.client_id')
  .whereNull('devices.released_at').limit(100).select('clients.email', 'devices.device_id');
rows.push(await bench('POST /api/app/login (bcrypt)', signIns.length, 10, (i) =>
  post('/api/app/login', { email: signIns[i].email, password: 'load-test-password', deviceId: signIns[i].device_id, deviceName: 'Load PC', platform: 'windows', appVersion: '1.1.0' })));
rows.push(await bench('GET /api/admin/clients?page=1', 300, 20, () => get('/api/admin/clients?page=1&pageSize=25', token)));
rows.push(await bench('GET /api/admin/clients?q=… (search)', 300, 20, (i) => get(`/api/admin/clients?q=Business%20${(i * 37) % CLIENTS}&pageSize=25`, token)));
rows.push(await bench('GET /api/admin/clients (deep page)', 200, 20, () => get(`/api/admin/clients?page=${Math.floor(CLIENTS / 25) - 1}&pageSize=25`, token)));
rows.push(await bench('GET /api/admin/licenses?status=active', 300, 20, () => get('/api/admin/licenses?status=active&pageSize=25', token)));
rows.push(await bench('GET /api/admin/stats (dashboard)', 100, 10, () => get('/api/admin/stats', token)));
fs.writeFileSync(path.join(process.env.DATA_DIR || os.tmpdir(), 'loadtest-results.json'), JSON.stringify({ clients: CLIENTS, seeded, rows }, null, 2));
server.close();
await knex.destroy();
