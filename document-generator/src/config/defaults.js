/** Default application settings. Stored values in SQLite override these key by key. */

import { DEFAULT_VISIBLE_TYPES, getType, normaliseTemplate } from './documentTypes.js';
import { STATE_NAMES } from './states.js';
import { DEFAULT_UNITS } from './units.js';

export { DEFAULT_UNITS };

export const CURRENCY_PRESETS = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
  { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2 },
  { code: 'AED', symbol: 'AED ', name: 'UAE Dirham', decimals: 2 },
  { code: 'SAR', symbol: 'SAR ', name: 'Saudi Riyal', decimals: 2 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', decimals: 2 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', decimals: 2 },
  { code: 'NPR', symbol: 'Rs ', name: 'Nepalese Rupee', decimals: 2 },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', decimals: 2 },
  { code: 'KWD', symbol: 'KD ', name: 'Kuwaiti Dinar', decimals: 3 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0 },
];

/** @deprecated use STATE_NAMES from states.js */
export const INDIAN_STATES = STATE_NAMES;

export const DEFAULT_SETTINGS = {
  setupComplete: false,
  documentStyle: 'tally-pro', // template id, see TEMPLATES in documentTypes.js
  businessType: 'trading',
  documentAccent: '#1f4fd8',
  theme: 'light', // 'light' | 'dark' | 'system'
  baseCurrency: 'INR',
  currencies: [{ code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2, rate: '1' }],
  taxSystem: 'GST', // 'GST' | 'VAT' | 'NONE'
  taxLabel: 'VAT',
  taxRates: ['0', '5', '12', '18', '28'],
  defaultTaxRate: '18',
  showBank: true,
  showHsn: true,
  showCustomerTaxId: true,
  showAmountInWords: true,
  showSignature: true,
  showStamp: true,
  autoRoundOff: true,
  defaultPaymentTerms: 'Payment due within 15 days of invoice date.',
  dateFormat: 'DD-MM-YYYY',
  fiscalYearStartMonth: 4,
  visibleDocTypes: DEFAULT_VISIBLE_TYPES,
  dashboardTypes: [], // empty = the business type's first 8 document types
  documentCopies: 1, // 1–4 copies when printing / downloading
  units: DEFAULT_UNITS,
  qrContent: 'UPI', // 'UPI' | 'DOCUMENT' | 'CONTACT' | 'CUSTOM'
  qrCustomText: '',
  footerText: 'This is a computer-generated document.',
  jurisdiction: '',
  declaration: 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
};

/** Settings every document type understands (with their meaning for the settings UI). */
export const DOC_SETTING_FIELDS = [
  { key: 'title', label: 'Printed title', type: 'text' },
  { key: 'template', label: 'Template', type: 'template' },
  { key: 'showPrices', label: 'Show prices & amounts', type: 'bool' },
  { key: 'showTax', label: 'Show tax columns', type: 'bool' },
  { key: 'showHsn', label: 'Show HSN/SAC', type: 'bool' },
  { key: 'showTaxBreakup', label: 'Show GST / tax breakup table', type: 'bool' },
  { key: 'showBank', label: 'Show bank details', type: 'bool' },
  { key: 'showAmountInWords', label: 'Show amount in words', type: 'bool' },
  { key: 'showCustomerTaxId', label: 'Show customer GSTIN / Tax ID', type: 'bool' },
  { key: 'showQr', label: 'Show QR code', type: 'bool' },
  { key: 'showSignature', label: 'Show signature block', type: 'bool' },
  { key: 'showStamp', label: 'Show company stamp', type: 'bool' },
  { key: 'showPackage', label: 'Show package information column', type: 'bool' },
  { key: 'showDeclaration', label: 'Show declaration', type: 'bool' },
  { key: 'dueDays', label: 'Default due in (days)', type: 'number', only: ['dueDays'] },
  { key: 'validityDays', label: 'Default validity (days)', type: 'number', only: ['validityDays'] },
  { key: 'deliveryDays', label: 'Default delivery in (days)', type: 'number', only: ['deliveryDays'] },
  { key: 'notes', label: 'Default notes', type: 'textarea' },
  { key: 'terms', label: 'Default terms & conditions', type: 'textarea' },
];

/**
 * Resolve effective settings for a document type:
 * built-in type defaults ← global settings ← saved per-type overrides.
 */
export function resolveDocSettings(typeId, settings, docSettings = {}) {
  const type = getType(typeId);
  const base = {
    title: type.title,
    showPrices: true,
    showTax: settings.taxSystem !== 'NONE',
    showHsn: settings.showHsn,
    showTaxBreakup: settings.taxSystem === 'GST',
    showBank: settings.showBank,
    showAmountInWords: settings.showAmountInWords,
    showCustomerTaxId: settings.showCustomerTaxId,
    showQr: false,
    showSignature: settings.showSignature,
    showStamp: settings.showStamp,
    showPackage: false,
    showDeclaration: type.financial && type.group !== 'payment',
    notes: '',
    terms: ['TAX_INVOICE', 'SERVICE_INVOICE'].includes(type.id) ? settings.defaultPaymentTerms || '' : '',
    template: '',
  };
  const resolved = { ...base, ...type.defaults, ...(docSettings[typeId] || {}) };
  // Template: per-type override, else the global default.
  resolved.template = normaliseTemplate(resolved.template || settings.documentStyle);
  return resolved;
}

/** Whether a document type shows monetary amounts (e.g. challans do not). */
export const pricesVisible = (typeId, settings, docSettings) =>
  resolveDocSettings(typeId, settings, docSettings).showPrices !== false;
