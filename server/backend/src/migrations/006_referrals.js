/**
 * Referrals (services/referrals.js).
 *  - clients.referral_code: the customer's own unique code (every client gets one; existing clients now).
 *  - clients.referred_by_id / referred_code / referred_at: who referred this customer, with which code, when.
 *  - payments.referral_code / referrer_id: the referral that came with an order.
 */

import crypto from 'node:crypto';

export async function up(knex) {
  const mysql = knex.client.config.client === 'mysql2';
  const ts = (t, name) => (mysql ? t.string(name, 30) : t.timestamp(name, { useTz: true }));
  await knex.schema.alterTable('clients', (t) => {
    t.string('referral_code', 12).nullable().unique();
    t.integer('referred_by_id').unsigned().nullable().references('clients.id').onDelete('SET NULL');
    t.string('referred_code', 12).notNullable().defaultTo('');
    ts(t, 'referred_at').nullable();
    t.index(['referred_by_id']);
  });
  await knex.schema.alterTable('payments', (t) => {
    t.string('referral_code', 12).notNullable().defaultTo('');
    t.integer('referrer_id').unsigned().nullable().references('clients.id').onDelete('SET NULL');
    t.index(['referrer_id']);
  });
  // A code for every existing client.
  const used = new Set();
  for (const { id } of await knex('clients').select('id').orderBy('id')) {
    let code;
    do code = String(crypto.randomInt(10000, 100000));
    while (used.has(code));
    used.add(code);
    await knex('clients').where({ id }).update({ referral_code: code });
  }
}

export async function down(knex) {
  await knex.schema.alterTable('payments', (t) => {
    t.dropForeign(['referrer_id']);
    t.dropIndex(['referrer_id']);
    t.dropColumn('referrer_id');
    t.dropColumn('referral_code');
  });
  await knex.schema.alterTable('clients', (t) => {
    t.dropForeign(['referred_by_id']);
    t.dropIndex(['referred_by_id']);
    t.dropColumn('referred_at');
    t.dropColumn('referred_code');
    t.dropColumn('referred_by_id');
    t.dropUnique(['referral_code']);
    t.dropColumn('referral_code');
  });
}
