/** Rate limits are active outside tests: brute-force attempts are stopped with HTTP 429. */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.RATE_LIMITS = 'on';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'docgen-rl-'));

const { createKnex, migrate } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');

let knex;
let server;
let base;
before(async () => {
  knex = createKnex({ databaseUrl: '', sqliteFile: path.join(process.env.DATA_DIR, 'rl.sqlite') });
  await migrate(knex);
  server = createApp(knex, { logger: { error() {} } }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await knex.destroy();
});

test('login attempts are limited per IP', async () => {
  const statuses = [];
  for (let i = 0; i < 32; i += 1) {
    const res = await fetch(`${base}/api/portal/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password' }),
    });
    statuses.push(res.status);
  }
  assert.equal(statuses[0], 401);
  assert.equal(statuses.at(-1), 429, 'blocked after 30 attempts');
  const body = await (
    await fetch(`${base}/api/app/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'AAAA-BBBB-CCCC' }) })
  ).json();
  assert.equal(body.error.code, 'RATE_LIMITED', 'the auth limit is shared by activation attempts');
});
