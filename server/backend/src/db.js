/**
 * Database access through Knex. MySQL 8 in production (DATABASE_URL=mysql://…),
 * SQLite for development, tests and small single-server installs.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import knexFactory from 'knex';
import { config } from './config.js';
import * as initial from './migrations/001_initial.js';
import * as signupSource from './migrations/002_signup_source.js';

/** Ordered migrations. Append new ones; never edit an applied migration. */
const MIGRATIONS = { '001_initial': initial, '002_signup_source': signupSource };

class InlineMigrationSource {
  getMigrations() {
    return Promise.resolve(Object.keys(MIGRATIONS));
  }
  getMigrationName(name) {
    return name;
  }
  getMigration(name) {
    return Promise.resolve(MIGRATIONS[name]);
  }
}

/** True when the server is configured for MySQL (DATABASE_URL or DB_NAME). */
export const usesMysql = () => !!(config.databaseUrl || config.db);

export function createKnex(overrides = {}) {
  const url = overrides.databaseUrl ?? config.databaseUrl;
  // Separate DB_* settings apply unless a test passes its own database explicitly.
  const parts = overrides.databaseUrl === undefined ? config.db : null;
  if (url || parts) {
    if (url && !/^mysql:\/\//i.test(url)) throw new Error('DATABASE_URL must be a MySQL URL: mysql://user:password@host:3306/database');
    const common = { charset: 'utf8mb4', supportBigNumbers: true };
    return knexFactory({
      client: 'mysql2',
      // utf8mb4 for all text; timestamps are stored as ISO-8601 text (see migrations).
      connection: url ? { uri: url, ...common } : { ...parts, ...common },
      pool: { min: 0, max: Number(process.env.DB_POOL_MAX || 10) },
      // Connection failures are thrown and explained (explainDatabaseError); don't also dump knex's stack trace.
      log: {
        warn: (m) => !/^Acquire connection error/.test(String(m)) && console.warn(m),
        error: (m) => console.error(m),
        deprecate: (m) => console.warn(m),
        debug: () => {},
      },
    });
  }
  // SQLite is optional (development/tests); MySQL needs no native module.
  try {
    createRequire(import.meta.url).resolve('better-sqlite3');
  } catch {
    throw new Error(
      'No DATABASE_URL is set and the optional SQLite driver (better-sqlite3) is not installed.\n' +
        'Set DATABASE_URL=mysql://user:password@localhost:3306/docgen (e.g. in server/.env), or run: npm install better-sqlite3',
    );
  }
  const file = overrides.sqliteFile ?? config.sqliteFile;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  return knexFactory({
    client: 'better-sqlite3',
    connection: { filename: file },
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 1,
      afterCreate: (conn, done) => {
        conn.pragma('journal_mode = WAL');
        conn.pragma('foreign_keys = ON');
        conn.pragma('busy_timeout = 5000');
        conn.pragma('synchronous = NORMAL');
        done();
      },
    },
  });
}

export async function migrate(knex) {
  await knex.migrate.latest({ migrationSource: new InlineMigrationSource() });
}

export const isMysql = (knex) => knex.client.config.client === 'mysql2';

/** Insert one row and return it (MySQL has no RETURNING). */
export async function insertOne(db, table, row) {
  const result = await db(table).insert(row);
  const id = Array.isArray(result) ? (typeof result[0] === 'object' ? result[0].id : result[0]) : result;
  return db(table).where({ id }).first();
}

/** Update rows matching `where` and return the first updated row. */
export async function updateOne(db, table, where, patch) {
  await db(table).where(where).update(patch);
  return db(table).where(where).first();
}

/** Current time as ISO string (stored as text/timestamptz consistently). */
export const nowIso = () => new Date().toISOString();

/** Parse a JSON text column (tolerates values that are already objects). */
export function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** Case-insensitive "contains" filter that works on both databases. */
export function whereContains(qb, columns, term) {
  const pattern = `%${term.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  // MySQL already uses backslash as the LIKE escape character (and '\' is not a valid literal there).
  const escape = qb.client.config.client === 'mysql2' ? '' : " escape '\\'";
  qb.where((w) => {
    for (const col of columns) w.orWhereRaw(`lower(${col}) like ?${escape}`, [pattern]);
  });
}

/** The MySQL account the server tries to use (for error messages; never includes the password). */
function mysqlTarget() {
  if (config.db) return { ...config.db, password: undefined, source: 'DB_HOST / DB_USER / DB_PASSWORD / DB_NAME' };
  const m = /^mysql:\/\/(?:([^:@/]*)(?::(.*))?@)?([^:/?#]+)(?::(\d+))?\/?([^?#]*)/i.exec(config.databaseUrl) || [];
  return { user: decodeSafe(m[1] || ''), host: m[3] || '?', port: Number(m[4] || 3306), database: decodeSafe(m[5] || ''), rawPassword: m[2] || '', source: 'DATABASE_URL' };
}
function decodeSafe(v) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/**
 * Turn a failed MySQL connection into a clear explanation with the fix,
 * instead of a stack trace (shown by src/index.js at startup).
 */
export function explainDatabaseError(err) {
  const t = mysqlTarget();
  const where = `${t.user || '(no user)'}@${t.host}:${t.port}${t.database ? `, database "${t.database}"` : ''}`;
  const files = config.envFiles.length ? config.envFiles.join(', ') : 'no .env file found (expected server/.env)';
  const lines = [`Cannot connect to MySQL as ${where}.`, `Settings come from ${t.source} in: ${files}`, ''];
  const code = err?.code || '';
  // Characters that break a mysql:// address (the driver then reads a wrong host, user or password).
  const brokenUrl = t.source === 'DATABASE_URL' && /[@#/?]|%(?![0-9a-f]{2})/i.test(t.rawPassword);
  if (brokenUrl || code === 'ER_ACCESS_DENIED_ERROR' || code === 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR') {
    lines.push(
      brokenUrl
        ? 'The password in DATABASE_URL contains @ # / ? or %, which breaks a mysql:// address — MySQL never receives the real password.'
        : 'MySQL rejected the user name or password.',
    );
    lines.push(
      'Fix one of these:',
      '  • Check the password: can you log in with   mysql -u ' + (t.user || 'root') + ' -p   ?',
      '  • Easiest: use separate settings instead of DATABASE_URL (no special-character rules):',
      '        DB_HOST=localhost',
      '        DB_PORT=3306',
      '        DB_USER=docgen',
      '        DB_PASSWORD=your password exactly as it is',
      '        DB_NAME=docgen',
      '    and remove or comment out the DATABASE_URL line.',
      '  • Or keep DATABASE_URL and encode special characters in the password: @ → %40  # → %23  / → %2F  ? → %3F  % → %25  : → %3A',
      '  • Recommended: a dedicated MySQL user instead of root. In MySQL (as root):',
      "        CREATE DATABASE IF NOT EXISTS docgen CHARACTER SET utf8mb4;",
      "        CREATE USER 'docgen'@'localhost' IDENTIFIED BY 'choose-a-password';",
      "        GRANT ALL PRIVILEGES ON docgen.* TO 'docgen'@'localhost';",
    );
  } else if (code === 'ER_BAD_DB_ERROR') {
    lines.push(`The database "${t.database}" does not exist. Create it in MySQL:`, `    CREATE DATABASE ${t.database || 'docgen'} CHARACTER SET utf8mb4;`);
  } else if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN') {
    lines.push(`Nothing answered at ${t.host}:${t.port}. Is MySQL running (Windows: Services → MySQL80) and is the host/port right?`);
  } else {
    lines.push(`MySQL error: ${err?.message || err}`);
  }
  lines.push('', 'Without any MySQL settings the server uses a local SQLite file instead (good for trying it out).');
  return lines.join('\n');
}
