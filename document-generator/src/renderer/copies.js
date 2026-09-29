/**
 * Copy labels for printing several copies of a document.
 * GST invoices follow CGST Rule 48: goods — Original for Recipient, Duplicate for
 * Transporter, Triplicate for Supplier; services — Original for Recipient,
 * Duplicate for Supplier.
 */

const GST_TYPES = new Set(['TAX_INVOICE', 'SERVICE_INVOICE', 'BILL_OF_SUPPLY', 'CREDIT_NOTE', 'DEBIT_NOTE']);
const GOODS = ['ORIGINAL FOR RECIPIENT', 'DUPLICATE FOR TRANSPORTER', 'TRIPLICATE FOR SUPPLIER', 'EXTRA COPY'];
const SERVICES = ['ORIGINAL FOR RECIPIENT', 'DUPLICATE FOR SUPPLIER', 'TRIPLICATE', 'EXTRA COPY'];
const OTHER = ['ORIGINAL', 'DUPLICATE', 'TRIPLICATE', 'EXTRA COPY'];

export const clampCopies = (n) => Math.min(4, Math.max(1, Number.parseInt(n, 10) || 1));

/**
 * @param {{id: string, group?: string}} type  document type
 * @param {number} index  0-based copy number
 * @param {number} total  number of copies being printed
 * @returns {string} label, or '' when no label is needed
 */
export function copyLabel(type, index, total) {
  if (GST_TYPES.has(type.id)) return (type.group === 'service' ? SERVICES : GOODS)[index] || 'EXTRA COPY';
  return total > 1 ? OTHER[index] || 'EXTRA COPY' : '';
}
