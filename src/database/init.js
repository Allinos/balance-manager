'use strict';

/**
 * Creates the database (if missing) and applies schema.sql.
 * Run with:  npm run db:init
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config/env');

async function init() {
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  // Connect without a database to be able to create it.
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });

  console.log(`> Creating database \`${config.db.database}\` (if not exists)...`);
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  );
  await conn.query(`USE \`${config.db.database}\`;`);

  console.log('> Applying schema.sql ...');
  await conn.query(schemaSql);

  console.log('✔ Database initialised.');
  await conn.end();
}

init().catch((err) => {
  console.error('✖ Database init failed:', err.message);
  process.exit(1);
});
