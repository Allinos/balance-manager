/**
 * Units of measure for products and services. Users can add their own in
 * Settings → Units; these are the built-in defaults (UQC-style short codes).
 */
export const PRODUCT_UNITS = [
  'Nos', 'Pcs', 'Pack', 'Box', 'Packet', 'Carton', 'Bag', 'Bundle', 'Roll', 'Set', 'Pair', 'Dozen', 'Unit',
  'Kg', 'g', 'Quintal', 'Tonne', 'Ltr', 'ml', 'Mtr', 'cm', 'mm', 'Ft', 'Inch', 'Sq.ft', 'Sq.m', 'Cu.ft', 'Cu.m',
  'Sheet', 'Bottle', 'Can', 'Jar', 'Tube', 'Drum', 'Coil', 'Load', 'Trip', 'Brass',
];

export const SERVICE_UNITS = ['Service', 'Hour', 'Day', 'Week', 'Month', 'Year', 'Visit', 'Project', 'Session', 'Job', 'Lot', 'Person', 'Lump sum'];

export const DEFAULT_UNITS = [...PRODUCT_UNITS, ...SERVICE_UNITS];

/**
 * Grouped options for the unit selector.
 * @param {string[]} custom  units from settings (anything not built in is shown as "Your units")
 * @param {'product'|'service'} [kind]  which group to list first
 */
export function unitOptions(custom = [], kind = 'product') {
  const extra = custom.filter((u) => u && !DEFAULT_UNITS.includes(u));
  const products = { group: 'Product units', options: PRODUCT_UNITS };
  const services = { group: 'Service units', options: SERVICE_UNITS };
  return [...(extra.length ? [{ group: 'Your units', options: extra }] : []), ...(kind === 'service' ? [services, products] : [products, services])];
}

export const isServiceUnit = (u) => SERVICE_UNITS.includes(u);
