/**
 * One product, one price: "DocGen", ₹1,250 one-time payment for a 1-year license.
 * Price, validity and computers are edited in Admin → Products.
 *
 * The three sample plans created by earlier versions (Starter / Business / Lifetime) are taken
 * off the website; ones that were never bought are switched off entirely.
 */

import { DEFAULT_PRODUCT } from '../services/common.js';

const SAMPLE_PLANS = ['STARTER', 'BUSINESS', 'LIFETIME'];

export async function up(knex) {
  const now = new Date().toISOString();
  if (!(await knex('plans').where({ code: DEFAULT_PRODUCT.code }).first('id'))) {
    // Columns added by later migrations (max_mobile_devices) are filled in by those migrations.
    const { max_mobile_devices: _later, ...product } = DEFAULT_PRODUCT;
    await knex('plans').insert({ ...product, created_at: now, updated_at: now });
  }
  const samples = await knex('plans').whereIn('code', SAMPLE_PLANS).select('id');
  for (const { id } of samples) {
    const bought = await knex('payments').where({ plan_id: id }).first('id');
    await knex('plans').where({ id }).update({ is_public: false, ...(bought ? {} : { is_active: false }), updated_at: now });
  }
}

export async function down() {
  // Data only; nothing to undo.
}
