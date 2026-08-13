'use strict';

/**
 * Seeds the database with:
 *   - a default admin user (+ a manager and operator demo account)
 *   - sample daily collections / deposits / DMS entries drawn from the
 *     original July-2026 spreadsheet
 * Run with:  npm run db:seed
 */
const bcrypt = require('bcryptjs');
const { pool, query } = require('../config/db');
const config = require('../config/env');
const { recalculateAll } = require('../services/ledger.service');
const { round2 } = require('../utils/money');

// online, cash, credit_balance (the "balance" column), old_balance_collection
const COLLECTIONS = [
  ['2026-07-01', 65430, 109060, 91775, 0, 'Opening day'],
  ['2026-07-02', 36100, 22074, 1350, 0, ''],
  ['2026-07-03', 65720, 29795, 106155, 0, ''],
  ['2026-07-04', 28500, 103460, 16835, 0, ''],
  ['2026-07-05', 60939, 42130, 94270, 0, ''],
  ['2026-07-06', 193990, 147340, 66920, 0, ''],
  ['2026-07-07', 54780, 114460, 70600, 0, ''],
  ['2026-07-08', 35645, 86990, 111495, 0, ''],
  ['2026-07-09', 131690, 94740, 22000, 0, ''],
  ['2026-07-10', 31370, 151680, 19650, 0, ''],
];

// deposit_date, amount, mode, deposited_by, reference_no
const DEPOSITS = [
  ['2026-07-02', 109050, 'Bank', 'Jagat Bora', 'DEP-0702'],
  ['2026-07-06', 144870, 'Bank', 'Jagat Bora', 'DEP-0706'],
  ['2026-07-07', 147800, 'Bank', 'Jagat Bora', 'DEP-0707'],
  ['2026-07-10', 181750, 'Bank', 'Jagat Bora', 'DEP-0710'],
];

// dms_date, dms_amount, receipt_amount
const DMS = [
  ['2026-07-02', 109050, 109050],  // reconciled
  ['2026-07-06', 144870, 144870],  // reconciled
  ['2026-07-07', 147800, 147000],  // mismatch (variance 800)
  ['2026-07-10', 181750, 0],       // pending
];

function reconcile(dms, receipt) {
  const variance = round2(dms - receipt);
  let status = 'pending';
  if (receipt > 0) status = variance === 0 ? 'reconciled' : 'mismatch';
  return { variance, status };
}

async function seed() {
  console.log('> Clearing existing data...');
  await query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['audit_logs', 'dms_deposits', 'deposits', 'collections', 'users']) {
    await query(`TRUNCATE TABLE ${t}`);
  }
  await query('SET FOREIGN_KEY_CHECKS = 1');

  console.log('> Creating users...');
  const adminHash = await bcrypt.hash(config.seed.adminPassword, 10);
  const demoHash = await bcrypt.hash('Demo@123', 10);
  const admin = await query(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    [config.seed.adminName, config.seed.adminEmail, adminHash, 'admin']
  );
  await query('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [
    'Manager Demo', 'manager@example.com', demoHash, 'manager',
  ]);
  await query('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [
    'Operator Demo', 'operator@example.com', demoHash, 'operator',
  ]);
  const adminId = admin.insertId;

  console.log('> Inserting collections...');
  for (const [date, online, cash, credit, oldBal, remarks] of COLLECTIONS) {
    const total = round2(online + cash + credit);
    await query(
      `INSERT INTO collections
        (collection_date, online, cash, credit_balance, total_collection,
         old_balance_collection, opening_balance, remaining_balance, available_cash, remarks, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`,
      [date, online, cash, credit, total, oldBal, remarks || null, adminId, adminId]
    );
  }

  console.log('> Inserting deposits...');
  for (const [date, amount, mode, by, ref] of DEPOSITS) {
    await query(
      `INSERT INTO deposits (deposit_date, amount, mode, deposited_by, reference_no, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [date, amount, mode, by, ref, adminId]
    );
  }

  console.log('> Inserting DMS entries...');
  for (const [date, dms, receipt] of DMS) {
    const { variance, status } = reconcile(dms, receipt);
    await query(
      `INSERT INTO dms_deposits (dms_date, dms_amount, receipt_amount, variance, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [date, dms, receipt, variance, status, adminId]
    );
  }

  console.log('> Recalculating running ledger...');
  await recalculateAll();

  console.log('\n✔ Seed complete.');
  console.log('  Admin login  :', config.seed.adminEmail, '/', config.seed.adminPassword);
  console.log('  Manager login: manager@example.com / Demo@123');
  console.log('  Operator     : operator@example.com / Demo@123\n');

  await pool.end();
}

seed().catch((err) => {
  console.error('✖ Seed failed:', err.message);
  process.exit(1);
});
