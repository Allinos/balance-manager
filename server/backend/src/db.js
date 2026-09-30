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

export function createKnex(overrides = {}) {
  const url = overrides.databaseUrl ?? config.databaseUrl;
  if (url) {
    if (!/^mysql:\/\//i.test(url)) throw new Error('DATABASE_URL must be a MySQL URL: mysql://user:password@host:3306/database');
    return knexFactory({
      client: 'mysql2',
      // utf8mb4 for all text; timestamps are stored as ISO-8601 text (see migrations).
      connection: { uri: url, charset: 'utf8mb4', supportBigNumbers: true },
      pool: { min: 0, max: Number(process.env.DB_POOL_MAX || 10) },
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
