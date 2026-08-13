'use strict';

const app = require('./src/app');
const config = require('./src/config/env');
const db = require('./src/config/db');

async function start() {
  try {
    await db.ping();
    console.log('✔ Connected to MySQL');
  } catch (err) {
    console.error('✖ Could not connect to MySQL:', err.message);
    console.error('  Check your .env settings and that the database exists (npm run db:init).');
    process.exit(1);
  }

  app.listen(config.port, () => {
    console.log(`\n🚀 Balance Manager running at http://localhost:${config.port}  [${config.env}]\n`);
  });
}

start();
