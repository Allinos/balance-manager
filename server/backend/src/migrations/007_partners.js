/**
 * Partners: authorised partners and distributors who refer customers for a commission (services/partners.js).
 * Referral codes now belong to partners only; the customers' own codes (006) are kept as history, unused.
 *
 *  - partners: the partner account (approved by an admin), its unique code, commission %, permissions
 *    (what its dashboard may show) and the partnership terms it last accepted.
 *  - partner_terms_acceptances: every acceptance of the terms (version, time, IP) — the record.
 *  - partner_clicks: visits through the partner's link, per day.
 *  - partner_commissions: one per paid payment (payment_id unique → never twice); pending → approved → paid,
 *    or reversed when the payment is refunded.
 *  - clients.partner_id / partner_code / partner_at: the partner a customer came through (first one wins).
 *  - payments.partner_id / partner_code: the partner of an order.
 */

export async function up(knex) {
  const mysql = knex.client.config.client === 'mysql2';
  const ts = (t, name) => (mysql ? t.string(name, 30) : t.timestamp(name, { useTz: true }));

  await knex.schema.createTable('partners', (t) => {
    t.increments('id').primary();
    t.string('name', 120).notNullable();
    t.string('email', 190).notNullable().unique();
    t.string('phone', 30).notNullable().defaultTo('');
    t.string('company', 160).notNullable().defaultTo('');
    t.string('city', 80).notNullable().defaultTo('');
    t.string('channel', 500).notNullable().defaultTo(''); // how they will promote DocGen
    t.string('password_hash', 120).notNullable();
    t.integer('token_version').notNullable().defaultTo(0);
    t.string('status', 12).notNullable().defaultTo('pending'); // pending | approved | rejected | suspended | terminated
    t.string('code', 12).nullable().unique();
    t.string('commission_rate', 8).notNullable().defaultTo('10'); // percent
    t.text('permissions').notNullable();
    t.string('terms_version', 20).notNullable().defaultTo('');
    ts(t, 'terms_accepted_at');
    t.text('notes').notNullable();
    ts(t, 'approved_at');
    t.integer('approved_by').unsigned();
    ts(t, 'last_login_at');
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
    t.index(['status', 'created_at']);
  });
  await knex.schema.createTable('partner_terms_acceptances', (t) => {
    t.increments('id').primary();
    t.integer('partner_id').unsigned().notNullable().references('partners.id').onDelete('CASCADE');
    t.string('terms_version', 20).notNullable();
    ts(t, 'accepted_at').notNullable();
    t.string('ip', 64).notNullable().defaultTo('');
    t.string('user_agent', 400).notNullable().defaultTo('');
    t.index(['partner_id']);
  });
  await knex.schema.createTable('partner_clicks', (t) => {
    t.increments('id').primary();
    t.integer('partner_id').unsigned().notNullable().references('partners.id').onDelete('CASCADE');
    t.string('day', 10).notNullable(); // YYYY-MM-DD
    t.integer('clicks').notNullable().defaultTo(0);
    t.unique(['partner_id', 'day']);
  });
  await knex.schema.createTable('partner_commissions', (t) => {
    t.increments('id').primary();
    t.integer('partner_id').unsigned().notNullable().references('partners.id').onDelete('CASCADE');
    t.integer('payment_id').unsigned().notNullable().unique().references('payments.id').onDelete('CASCADE');
    t.integer('client_id').unsigned().references('clients.id').onDelete('SET NULL');
    t.integer('base_paise').notNullable();
    t.string('rate', 8).notNullable();
    t.integer('amount_paise').notNullable();
    t.string('status', 12).notNullable().defaultTo('pending'); // pending | approved | paid | reversed
    ts(t, 'approved_at');
    ts(t, 'paid_at');
    t.string('payout_ref', 120).notNullable().defaultTo('');
    ts(t, 'reversed_at');
    t.string('reversal_reason', 300).notNullable().defaultTo('');
    t.boolean('reversed_after_payout').notNullable().defaultTo(false);
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
    t.index(['partner_id', 'status']);
    t.index(['partner_id', 'created_at']);
  });
  await knex.schema.alterTable('clients', (t) => {
    t.integer('partner_id').unsigned().nullable().references('partners.id').onDelete('SET NULL');
    t.string('partner_code', 12).notNullable().defaultTo('');
    ts(t, 'partner_at').nullable();
    t.index(['partner_id']);
  });
  await knex.schema.alterTable('payments', (t) => {
    t.integer('partner_id').unsigned().nullable().references('partners.id').onDelete('SET NULL');
    t.string('partner_code', 12).notNullable().defaultTo('');
    t.index(['partner_id', 'status']);
  });
}

export async function down(knex) {
  await knex.schema.alterTable('payments', (t) => {
    t.dropForeign(['partner_id']);
    t.dropIndex(['partner_id', 'status']);
    t.dropColumn('partner_code');
    t.dropColumn('partner_id');
  });
  await knex.schema.alterTable('clients', (t) => {
    t.dropForeign(['partner_id']);
    t.dropIndex(['partner_id']);
    t.dropColumn('partner_at');
    t.dropColumn('partner_code');
    t.dropColumn('partner_id');
  });
  await knex.schema.dropTable('partner_commissions');
  await knex.schema.dropTable('partner_clicks');
  await knex.schema.dropTable('partner_terms_acceptances');
  await knex.schema.dropTable('partners');
}
