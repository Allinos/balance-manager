/**
 * DocGen for Android: a table for copying a phone's data to the server after an upgrade. The feature was withdrawn
 * (4 November 2026: the apps keep all data on the device for now), so nothing writes to it; the migration stays
 * because databases may already have applied it. Never edit an applied migration.
 */

export async function up(knex) {
  const mysql = knex.client.config.client === 'mysql2';
  await knex.schema.createTable('app_data_uploads', (t) => {
    t.increments('id').primary();
    t.integer('license_id').unsigned().notNullable().index();
    t.integer('client_id').unsigned().nullable();
    t.string('device_id', 80).notNullable();
    t.string('account_uid', 128).notNullable().defaultTo(''); // the free account (Firebase uid)
    t.string('account_name', 120).notNullable().defaultTo('');
    t.string('account_business', 160).notNullable().defaultTo('');
    t.string('account_phone', 30).notNullable().defaultTo('');
    t.integer('documents').notNullable().defaultTo(0);
    t.integer('parties').notNullable().defaultTo(0);
    t.integer('products').notNullable().defaultTo(0);
    t.integer('size_bytes').notNullable().defaultTo(0);
    t.string('sha256', 64).notNullable();
    if (mysql) t.text('data', 'longtext').notNullable();
    else t.text('data').notNullable();
    if (mysql) t.string('created_at', 30).notNullable();
    else t.timestamp('created_at', { useTz: true }).notNullable();
    t.index(['license_id', 'device_id']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('app_data_uploads');
}
