/** Extra products used by the tests (the real database starts with one product, DocGen). */
export async function addSamplePlans(knex) {
  const ts = new Date().toISOString();
  const row = (code, name, price, days, devices, sort) => ({
    code, name, description: '', price_paise: price, currency: 'INR', duration_days: days, max_devices: devices,
    features: '[]', is_active: true, is_public: true, sort_order: sort, created_at: ts, updated_at: ts,
  });
  await knex('plans').insert([
    row('STARTER', 'Starter', 99900, 365, 1, 1),
    row('BUSINESS', 'Business', 249900, 365, 3, 2),
    row('LIFETIME', 'Lifetime', 699900, 0, 2, 3),
  ]);
}
