import { dec, toPlain } from './decimal.js';

/** Group item lines by HSN/SAC and rate (Tally's "HSN/SAC summary"). */
export function hsnSummary(items) {
  const map = new Map();
  for (const it of items) {
    const key = `${it.hsn_sac || ''}|${toPlain(it.tax_rate || '0')}`;
    const row = map.get(key) || { hsn: it.hsn_sac || '', rate: it.tax_rate || '0', taxable: 0n, cgst: 0n, sgst: 0n, igst: 0n, tax: 0n };
    row.taxable += dec(it.taxable_amount);
    row.cgst += dec(it.cgst_amount);
    row.sgst += dec(it.sgst_amount);
    row.igst += dec(it.igst_amount);
    row.tax += dec(it.tax_amount);
    map.set(key, row);
  }
  return [...map.values()];
}
