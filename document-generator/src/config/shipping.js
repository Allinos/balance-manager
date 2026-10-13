/**
 * Shipping address (Ship To / Consignee) on bills.
 *
 * Settings → Documents → "Show shipping address in bill" (off by default) sets whether a new document of a type that
 * goes with goods starts with its Shipping address switch on. Each document then has its own switch (meta.showShipping):
 *   on, no different address  → the billing details are printed again as Ship To (as Tally does)
 *   on, different address     → the consignee: name, address, GSTIN, state and contact number
 *   off                       → only the billing address
 * The different address is kept in the document's shipping_address column, the other consignee details in meta
 * (ship_name, ship_gstin or ship_tax_id, ship_state, ship_phone). Documents saved before the switch existed show a shipping address
 * when they have one, as they always did.
 */

/** Document types that can show a shipping address (the ones that go with goods to a customer). */
export const SHIPPING_TYPES = [
  'TAX_INVOICE', 'BILL_OF_SUPPLY', 'PROFORMA_INVOICE', 'SALES_ORDER', 'DELIVERY_CHALLAN', 'QUOTATION', 'ESTIMATE',
  'CREDIT_NOTE', 'DEBIT_NOTE',
];

export const SHIP_FIELDS = ['ship_name', 'ship_gstin', 'ship_tax_id', 'ship_state', 'ship_phone'];

/** Whether the editor offers the Shipping address switch for this document. */
export const offersShipping = (doc) => SHIPPING_TYPES.includes(doc.document_type) || !!doc.shipping_address?.trim() || typeof doc.meta?.showShipping === 'boolean';

/** Whether the shipping address is printed on this document. */
export function shippingOn(doc) {
  const flag = doc.meta?.showShipping;
  return typeof flag === 'boolean' ? flag : !!doc.shipping_address?.trim();
}

/** Whether a different shipping address (consignee) has been entered. */
export const hasDifferentShipTo = (doc) => !!(doc.shipping_address?.trim() || doc.meta?.ship_name?.trim());

/** The meta a new document of this type starts with (from Settings). */
export const shippingMetaFor = (typeId, settings) => (SHIPPING_TYPES.includes(typeId) ? { showShipping: !!settings?.showShippingAddress } : {});

/**
 * What the document prints as Ship To, or null when it shows only the billing address.
 * @returns {{name, company, address, gstin, state, phone, same: boolean} | null}
 */
export function shipToOf(doc) {
  if (!shippingOn(doc)) return null;
  const m = doc.meta || {};
  if (!hasDifferentShipTo(doc)) {
    return {
      same: true,
      name: doc.party_name,
      company: doc.party_company,
      address: doc.party_address,
      gstin: doc.party_gstin || doc.party_tax_id,
      state: doc.party_state,
      phone: doc.party_phone,
    };
  }
  const named = !!m.ship_name?.trim();
  return {
    same: false,
    name: named ? m.ship_name : doc.party_name,
    company: named ? '' : doc.party_company,
    address: doc.shipping_address || '',
    gstin: m.ship_gstin || m.ship_tax_id || '',
    state: m.ship_state || (named ? '' : doc.party_state),
    phone: m.ship_phone || '',
  };
}
