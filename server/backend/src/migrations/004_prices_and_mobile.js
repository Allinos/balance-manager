/**
 * Prices per license duration, and the mobile app.
 *
 *  - plan_prices: each product (plan) can be bought for several durations, each with its own price
 *    (e.g. 1 year ₹1,250 · 2 years ₹2,250 · 5 years ₹4,999). duration_days 0 = lifetime.
 *    Existing products get one price from their current price and duration.
 *  - plans / licenses: max_mobile_devices — phones/tablets per license (DocGen Mobile), separate
 *    from the computer limit (max_devices).
 *  - devices.kind: 'desktop' (the Windows/macOS/Linux app) or 'mobile' (DocGen Mobile).
 *  - payments: which price was bought and for how many days.
 */

const DEFAULT_MOBILE_DEVICES = 2;

export async function up(knex) {
  const mysql = knex.client.config.client === 'mysql2';
  const ts = (t, name) => (mysql ? t.string(name, 30) : t.timestamp(name, { useTz: true }));

  await knex.schema.createTable('plan_prices', (t) => {
    t.increments('id').primary();
    t.integer('plan_id').unsigned().notNullable().references('plans.id').onDelete('CASCADE');
    t.integer('duration_days').notNullable(); // 0 = lifetime
    t.integer('price_paise').notNullable();
    t.string('label', 40).notNullable().defaultTo(''); // '' = from the duration ("2 years")
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
    t.index(['plan_id', 'is_active']);
  });
  await knex.schema.alterTable('plans', (t) => {
    t.integer('max_mobile_devices').notNullable().defaultTo(DEFAULT_MOBILE_DEVICES);
  });
  await knex.schema.alterTable('licenses', (t) => {
    t.integer('max_mobile_devices').notNullable().defaultTo(DEFAULT_MOBILE_DEVICES);
  });
  await knex.schema.alterTable('devices', (t) => {
    t.string('kind', 10).notNullable().defaultTo('desktop');
  });
  await knex.schema.alterTable('payments', (t) => {
    t.integer('price_id').unsigned();
    t.integer('duration_days');
  });

  const now = new Date().toISOString();
  for (const plan of await knex('plans').select('id', 'code', 'price_paise', 'duration_days')) {
    const rows = [{ plan_id: plan.id, duration_days: plan.duration_days, price_paise: plan.price_paise, sort_order: 0, created_at: now, updated_at: now }];
    // The default product also offers longer licenses (prices editable in Admin → Products & pricing).
    if (plan.code === 'DOCGEN' && plan.duration_days === 365 && plan.price_paise === 125000) {
      rows.push(
        { plan_id: plan.id, duration_days: 730, price_paise: 225000, sort_order: 1, created_at: now, updated_at: now },
        { plan_id: plan.id, duration_days: 1825, price_paise: 499900, sort_order: 2, created_at: now, updated_at: now },
      );
    }
    await knex('plan_prices').insert(rows);
  }
  // Payments made before this version bought the plan's own duration.
  await knex('payments').whereNull('duration_days').update({
    duration_days: knex.raw('(select duration_days from plans where plans.id = payments.plan_id)'),
  });
}

export async function down(knex) {
  await knex.schema.alterTable('payments', (t) => {
    t.dropColumn('duration_days');
    t.dropColumn('price_id');
  });
  await knex.schema.alterTable('devices', (t) => t.dropColumn('kind'));
  await knex.schema.alterTable('licenses', (t) => t.dropColumn('max_mobile_devices'));
  await knex.schema.alterTable('plans', (t) => t.dropColumn('max_mobile_devices'));
  await knex.schema.dropTableIfExists('plan_prices');
}
