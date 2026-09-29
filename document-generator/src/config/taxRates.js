/** GST rate options for the searchable GST selector (settings rates + standard GST slabs). */

const GST_RATES = ['0', '0.25', '3', '5', '12', '18', '28', '40'];

const num = (r) => Number.parseFloat(r) || 0;

/**
 * @param {{taxSystem?: string, taxRates?: string[]}} settings
 * @param {string} [current] always included (e.g. a custom rate on an old document)
 */
export function taxRateOptions(settings, current) {
  const base = settings.taxSystem === 'GST' ? [...GST_RATES, ...(settings.taxRates || [])] : settings.taxRates || ['0'];
  const all = [...new Set([...base, ...(current !== undefined && current !== '' ? [String(current)] : [])].map((r) => String(num(r))))];
  return all.sort((a, b) => num(a) - num(b)).map((r) => ({ value: r, label: `${r}%`, hint: r === '0' ? 'Nil / exempt' : '' }));
}

/** Accept only a plain percentage between 0 and 100. */
export const isValidRate = (v) => /^\d{1,3}(\.\d{1,3})?$/.test(String(v)) && num(v) <= 100;

/** Canonical form of a stored rate ("18.00" → "18") so it matches an option. */
export const rateValue = (r) => String(num(r));
