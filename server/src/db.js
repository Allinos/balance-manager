/**
 * Database access through Knex. PostgreSQL in production (DATABASE_URL),
 * SQLite for development, tests and small single-server installs.
 */

import fs from 'node:fs';
import path from 'node:path';
import knexFactory from 'knex';
import { config } from './config.js';
import * as initial from './migrations/001_initial.js';

/** Ordered migrations. Append new ones; never edit an applied migration. */
const MIGRATIONS = { '001_initial': initial };

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
    return knexFactory({
      client: 'pg',
      connection: url,
      pool: { min: 0, max: Number(process.env.DB_POOL_MAX || 10) },
    });
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

export const isPg = (knex) => knex.client.config.client === 'pg';

/** Current time as ISO string (stored as text/timestamptz consistently). */
export const nowIso = () => new Date().toISOString();

/** Parse a JSON column that may already be an object (pg json) or a string (sqlite). */
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
  qb.where((w) => {
    for (const col of columns) w.orWhereRaw(`lower(${col}) like ? escape '\\'`, [pattern]);
  });
}
