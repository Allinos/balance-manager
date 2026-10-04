/**
 * Help & Support, and the Terms acceptance at checkout.
 *
 *  - support_requests: a question or problem sent from the website (Help & Support, Contact Us) or the
 *    client panel. client_id is set only when the customer was signed in. status: open → answered
 *    (support replied) → closed (solved); a new customer message opens it again.
 *  - support_messages: the conversation of a request, oldest first. author 'customer' or 'support'.
 *  - payments.terms_accepted_at: when the buyer ticked "I agree to the Terms & Conditions".
 */

export async function up(knex) {
  const mysql = knex.client.config.client === 'mysql2';
  const ts = (t, name) => (mysql ? t.string(name, 30) : t.timestamp(name, { useTz: true }));

  await knex.schema.createTable('support_requests', (t) => {
    t.increments('id').primary();
    t.integer('client_id').unsigned().references('clients.id').onDelete('SET NULL');
    t.string('name', 120).notNullable();
    t.string('email', 190).notNullable();
    t.string('phone', 30).notNullable().defaultTo('');
    t.string('topic', 30).notNullable().defaultTo('other');
    t.string('subject', 160).notNullable();
    t.string('status', 12).notNullable().defaultTo('open');
    t.string('source', 12).notNullable().defaultTo('website');
    t.string('last_message_by', 10).notNullable().defaultTo('customer');
    ts(t, 'last_message_at').notNullable();
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
    t.index(['client_id']);
    t.index(['status', 'last_message_at']);
  });
  await knex.schema.createTable('support_messages', (t) => {
    t.increments('id').primary();
    t.integer('request_id').unsigned().notNullable().references('support_requests.id').onDelete('CASCADE');
    t.string('author', 10).notNullable();
    t.integer('admin_id').unsigned();
    t.text('body').notNullable();
    ts(t, 'created_at').notNullable();
    t.index(['request_id']);
  });
  await knex.schema.alterTable('payments', (t) => {
    ts(t, 'terms_accepted_at');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('payments', (t) => t.dropColumn('terms_accepted_at'));
  await knex.schema.dropTableIfExists('support_messages');
  await knex.schema.dropTableIfExists('support_requests');
}
