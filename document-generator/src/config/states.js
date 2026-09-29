/**
 * Indian states / union territories with GST state codes (first two digits of a GSTIN).
 * Used for "Place of supply" (state name + code, required on inter-state invoices).
 */
export const GST_STATES = [
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '18', name: 'Assam' },
  { code: '10', name: 'Bihar' },
  { code: '04', name: 'Chandigarh' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '07', name: 'Delhi' },
  { code: '30', name: 'Goa' },
  { code: '24', name: 'Gujarat' },
  { code: '06', name: 'Haryana' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '20', name: 'Jharkhand' },
  { code: '29', name: 'Karnataka' },
  { code: '32', name: 'Kerala' },
  { code: '38', name: 'Ladakh' },
  { code: '31', name: 'Lakshadweep' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '27', name: 'Maharashtra' },
  { code: '14', name: 'Manipur' },
  { code: '17', name: 'Meghalaya' },
  { code: '15', name: 'Mizoram' },
  { code: '13', name: 'Nagaland' },
  { code: '21', name: 'Odisha' },
  { code: '34', name: 'Puducherry' },
  { code: '03', name: 'Punjab' },
  { code: '08', name: 'Rajasthan' },
  { code: '11', name: 'Sikkim' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '36', name: 'Telangana' },
  { code: '16', name: 'Tripura' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '19', name: 'West Bengal' },
  { code: '97', name: 'Other Territory' },
  { code: '96', name: 'Other Country (export)' },
];

export const STATE_NAMES = GST_STATES.map((s) => s.name);

const byName = new Map(GST_STATES.map((s) => [s.name.toLowerCase(), s]));
const byCode = new Map(GST_STATES.map((s) => [s.code, s]));

/** GST state code for a state name, or '' if unknown. */
export const stateCode = (name) => byName.get(String(name || '').trim().toLowerCase())?.code || '';

/** "Karnataka (29)" style label. */
export const stateWithCode = (name) => {
  const code = stateCode(name);
  return name ? (code ? `${name} (${code})` : name) : '';
};

/** State name from the first two digits of a GSTIN, or ''. */
export function stateFromGstin(gstin) {
  const m = /^(\d{2})[A-Z0-9]{13}$/.exec(String(gstin || '').trim().toUpperCase());
  return m ? byCode.get(m[1])?.name || '' : '';
}

/** Basic GSTIN format check (15 chars: 2-digit state, PAN, entity, Z, checksum). */
export const isValidGstin = (v) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(v || '').trim().toUpperCase());
