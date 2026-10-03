/**
 * Products ("plans") and their prices per license duration.
 *
 * A product such as "DocGen" can be bought for several durations, each with its own price
 * (plan_prices). The product's own price/duration columns mirror its first active price, for
 * older code paths and reports. A product without price rows is sold at those columns.
 */

import { nowIso } from '../db.js';
import { ApiError, notFound } from '../lib/http.js';

/** "1 year", "2 years", "6 months", "90 days", "Lifetime". */
export function durationLabel(days) {
  if (!days) return 'Lifetime';
  if (days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`;
  if (days % 30 === 0 && days < 365) return days === 30 ? '1 month' : `${days / 30} months`;
  return `${days} days`;
}

export const publicPrice = (p) => ({
  id: p.id,
  durationDays: p.duration_days,
  label: p.label || durationLabel(p.duration_days),
  price: p.price_paise / 100,
  pricePaise: p.price_paise,
  isActive: p.is_active === undefined ? true : !!p.is_active,
});

/** Price options of products: Map planId → rows (active only unless `all`), cheapest duration first. */
export async function pricesByPlan(knex, plans, { all = false } = {}) {
  const ids = plans.map((p) => p.id);
  const rows = ids.length ? await knex('plan_prices').whereIn('plan_id', ids).modify((q) => !all && q.where({ is_active: true })) : [];
  const map = new Map();
  for (const plan of plans) {
    const own = rows
      .filter((r) => r.plan_id === plan.id)
      .sort((a, b) => a.sort_order - b.sort_order || (a.duration_days || 1e9) - (b.duration_days || 1e9));
    // Products created before prices existed (or without any) are sold at their own price.
    map.set(plan.id, own.length ? own : [{ id: null, plan_id: plan.id, duration_days: plan.duration_days, price_paise: plan.price_paise, label: '', is_active: true }]);
  }
  return map;
}

/** The price a customer chose (or the product's first one). Throws when it is not on sale. */
export async function resolvePrice(knex, plan, priceId) {
  const options = (await pricesByPlan(knex, [plan])).get(plan.id);
  if (!priceId) return options[0];
  const price = options.find((p) => p.id === priceId);
  if (!price) throw notFound('Price');
  return price;
}

/**
 * Replace a product's price list. Prices already used by payments are switched off instead of deleted.
 * @param {{id?: number, durationDays: number, price: number, label?: string}[]} input
 */
export async function saveProductPrices(trx, planId, input) {
  // Shown to customers shortest first, lifetime last, whatever order the admin typed them in.
  const prices = [...input].sort((a, b) => (a.durationDays || 1e9) - (b.durationDays || 1e9));
  if (!prices.length) throw new ApiError(400, 'VALIDATION', 'Add at least one price.');
  const seen = new Set();
  for (const p of prices) {
    if (seen.has(p.durationDays)) throw new ApiError(400, 'VALIDATION', `There are two prices for ${durationLabel(p.durationDays)}.`);
    seen.add(p.durationDays);
  }
  const ts = nowIso();
  const existing = await trx('plan_prices').where({ plan_id: planId });
  const keep = new Set();
  for (const [i, p] of prices.entries()) {
    const row = { duration_days: p.durationDays, price_paise: Math.round(p.price * 100), label: p.label || '', is_active: true, sort_order: i, updated_at: ts };
    const current = p.id && existing.find((e) => e.id === p.id);
    if (current) {
      await trx('plan_prices').where({ id: current.id }).update(row);
      keep.add(current.id);
    } else {
      await trx('plan_prices').insert({ ...row, plan_id: planId, created_at: ts });
    }
  }
  for (const old of existing.filter((e) => !keep.has(e.id))) {
    const used = await trx('payments').where({ price_id: old.id }).first('id');
    if (used) await trx('plan_prices').where({ id: old.id }).update({ is_active: false, updated_at: ts });
    else await trx('plan_prices').where({ id: old.id }).del();
  }
  // The product's own columns mirror its first (shortest) price.
  await trx('plans').where({ id: planId }).update({ price_paise: Math.round(prices[0].price * 100), duration_days: prices[0].durationDays, updated_at: ts });
}
