/**
 * Where each client came from (ads and campaigns): utm_source / utm_medium / utm_campaign
 * as columns for reports, the rest (gclid, fbclid, term, content, landing page, referrer) as JSON.
 */

export async function up(knex) {
  await knex.schema.alterTable('clients', (t) => {
    t.string('ref_source', 60).notNullable().defaultTo('');
    t.string('ref_medium', 60).notNullable().defaultTo('');
    t.string('ref_campaign', 120).notNullable().defaultTo('');
    t.text('ref_details');
    t.index(['ref_source', 'ref_campaign']);
  });
}

export async function down(knex) {
  await knex.schema.alterTable('clients', (t) => {
    t.dropIndex(['ref_source', 'ref_campaign']);
    t.dropColumn('ref_details');
    t.dropColumn('ref_campaign');
    t.dropColumn('ref_medium');
    t.dropColumn('ref_source');
  });
}
