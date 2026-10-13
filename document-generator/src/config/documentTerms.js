/**
 * Default terms & conditions and declarations, one set per document type.
 *
 * They are only starting points: Settings → Document Types changes them for a type, and every document can
 * be changed on its own in the editor. Wording follows common Indian small-business practice and is kept
 * general enough for VAT and no-tax businesses too (nothing here names a rate, a city or a law section that
 * would be wrong elsewhere).
 */

const numbered = (lines) => lines.filter(Boolean).map((l, i) => `${i + 1}. ${l}`).join('\n');

/** Lines printed after the payment terms of an invoice (Settings → Documents → Default payment terms). */
const INVOICE_TERMS = [
  'Please quote the invoice number when making payment.',
  'Goods once sold will not be taken back or exchanged unless they are defective.',
  'Any discrepancy in quantity, quality or amount must be reported within 7 days of receipt.',
  'Our responsibility ceases once the goods are handed over to the carrier or delivered.',
];

const SERVICE_TERMS = [
  'Please quote the invoice number when making payment.',
  'Any query about this invoice must be raised within 7 days of receipt.',
  'Work outside the agreed scope will be charged separately.',
];

/** Terms per document type. Invoices start with the payment terms from Settings → Documents. */
export const DEFAULT_TERMS = {
  TAX_INVOICE: (s) => numbered([s.defaultPaymentTerms, ...INVOICE_TERMS]),
  SERVICE_INVOICE: (s) => numbered([s.defaultPaymentTerms, ...SERVICE_TERMS]),
  BILL_OF_SUPPLY: (s) => numbered([s.defaultPaymentTerms, ...INVOICE_TERMS]),
  QUOTATION: () =>
    numbered([
      'Prices are valid until the date mentioned above.',
      'Taxes are extra as applicable, unless shown in the quotation.',
      'Delivery within 7 days of order confirmation, subject to availability.',
      'Payment: 50% advance with the order, balance before delivery.',
      'Prices may change if quantities or specifications change.',
    ]),
  REVERSE_QUOTATION: () =>
    numbered([
      'The rates above are the prices at which we offer to buy.',
      'Please confirm availability and delivery schedule in writing.',
      'Goods must match the agreed specification and pass our inspection.',
      'A purchase order will follow on acceptance.',
    ]),
  ESTIMATE: () =>
    numbered([
      'This is an estimate, not a final bill. Final charges depend on actual quantities and scope.',
      'The estimate is valid until the date mentioned above.',
      'Taxes are extra as applicable, unless shown above.',
      'Any additional work will be charged after your approval.',
    ]),
  PROFORMA_INVOICE: () =>
    numbered([
      'This is a proforma invoice and not a demand for payment or a tax invoice.',
      'A tax invoice will be issued on dispatch / completion.',
      'Prices are valid until the date mentioned above.',
      'Goods are dispatched after receipt of payment as agreed.',
    ]),
  SALES_ORDER: () =>
    numbered([
      'Delivery as per the schedule above, subject to availability.',
      'Payment as per the agreed terms.',
      'Changes to this order must be confirmed in writing.',
      'Cancellation after dispatch is not accepted.',
    ]),
  DELIVERY_CHALLAN: () =>
    numbered([
      'Received the above goods in good condition and in full quantity.',
      'This challan is not an invoice; an invoice will follow where applicable.',
      'Please report any shortage or damage at the time of delivery.',
    ]),
  PROOF_OF_DELIVERY: () =>
    numbered([
      'Please check the goods before signing. Note any damage, shortage or wrong item in Remarks.',
      'A signature without remarks confirms the goods were received complete and in good condition.',
      'Please sign, write your name, date and time, and stamp below.',
    ]),
  PURCHASE_ORDER: () =>
    numbered([
      'Please mention our PO number on your invoice, delivery challan and all correspondence.',
      'Goods must match the specification and quantity ordered.',
      'Delivery on or before the date mentioned above.',
      'Rejected goods will be returned at the supplier’s cost.',
      'Payment as per the agreed terms after receipt and acceptance of goods.',
    ]),
  GOODS_RECEIPT: () => numbered(['Goods received subject to inspection and acceptance.', 'Shortages or damages are noted above.']),
  PURCHASE_INVOICE: () => '',
  CREDIT_NOTE: () =>
    numbered(['This credit note is issued against the invoice referenced above.', 'The amount will be adjusted against your next payment or refunded as agreed.']),
  DEBIT_NOTE: () =>
    numbered(['This debit note is issued against the invoice referenced above.', 'Please pay the amount along with your next payment.']),
  PAYMENT_RECEIPT: () =>
    numbered([
      'Payment by cheque or online transfer is subject to realisation.',
      'Please quote the receipt number for any query.',
      'This receipt is valid only with an authorised signature.',
    ]),
  PAYMENT_VOUCHER: () => numbered(['Payment made towards the bill / purpose mentioned above.', 'Please acknowledge receipt of this payment.']),
  WORK_ORDER: () =>
    numbered([
      'Work to be carried out as per the scope and specifications above.',
      'Completion by the date mentioned above.',
      'Materials, safety and site cleaning are the contractor’s responsibility unless agreed otherwise.',
      'Payment on satisfactory completion and verification of work.',
    ]),
  JOB_COMPLETION: () =>
    numbered(['The work described above has been completed to the customer’s satisfaction.', 'Please report any issue within 7 days of completion.']),
};

/**
 * Declarations per type. Tax invoices use the declaration from Settings → Documents (as before);
 * a declaration is printed when "Show declaration" is on for the type.
 */
export const DEFAULT_DECLARATIONS = {
  TAX_INVOICE: (s) => s.declaration || '',
  SERVICE_INVOICE: (s) => s.declaration || '',
  BILL_OF_SUPPLY: () =>
    'We declare that this bill of supply shows the actual price of the goods / services described and that all particulars are true and correct.',
  CREDIT_NOTE: () => 'We declare that the particulars given above are true and correct and that this note is issued against the invoice referenced above.',
  DEBIT_NOTE: () => 'We declare that the particulars given above are true and correct and that this note is issued against the invoice referenced above.',
  PURCHASE_INVOICE: () => 'We certify that the particulars given above are true and correct.',
  PROFORMA_INVOICE: () => 'This is a proforma invoice. It is not a tax invoice and does not entitle the holder to claim input tax credit.',
  QUOTATION: () => 'We declare that the prices quoted above are true and correct to the best of our knowledge.',
  ESTIMATE: () => 'This estimate is prepared on the information available today and may change with the actual scope of work.',
  DELIVERY_CHALLAN: () => 'Goods sent as per the purpose mentioned above, not for sale unless stated.',
  PROOF_OF_DELIVERY: () => 'Received the goods listed above in good condition, except as noted in the remarks.',
  PAYMENT_RECEIPT: () => 'Received the above amount with thanks.',
  PAYMENT_VOUCHER: () => 'Paid the above amount for the purpose mentioned.',
  JOB_COMPLETION: () => 'I / We confirm that the above work has been completed satisfactorily.',
};

/** Default terms of a document type (string). */
export const defaultTermsFor = (typeId, settings) => DEFAULT_TERMS[typeId]?.(settings || {}) ?? '';

/** Default declaration of a document type (string). */
export const defaultDeclarationFor = (typeId, settings) => DEFAULT_DECLARATIONS[typeId]?.(settings || {}) ?? '';
