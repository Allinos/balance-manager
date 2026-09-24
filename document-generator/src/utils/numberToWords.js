/**
 * Currency amount → words.
 *
 *   amountInWords('12450.00', 'INR')  → 'Twelve Thousand Four Hundred Fifty Rupees Only'
 *   amountInWords('125000', 'INR')    → 'One Lakh Twenty Five Thousand Rupees Only'
 *   amountInWords('10.50', 'INR')     → 'Ten Rupees and Fifty Paise Only'
 *   amountInWords('1250000', 'USD')   → 'One Million Two Hundred Fifty Thousand Dollars Only'
 *
 * Indian grouping (Thousand, Lakh, Crore) is used for INR and neighbouring
 * currencies; international grouping (Thousand, Million, Billion, Trillion)
 * for all others.
 */

import { toFixed } from './decimal.js';

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** Currency word configuration. Add entries here to support more currencies. */
export const CURRENCY_WORDS = {
  INR: { major: ['Rupee', 'Rupees'], minor: ['Paisa', 'Paise'], system: 'indian' },
  NPR: { major: ['Nepalese Rupee', 'Nepalese Rupees'], minor: ['Paisa', 'Paisa'], system: 'indian' },
  PKR: { major: ['Rupee', 'Rupees'], minor: ['Paisa', 'Paise'], system: 'indian' },
  LKR: { major: ['Rupee', 'Rupees'], minor: ['Cent', 'Cents'], system: 'international' },
  BDT: { major: ['Taka', 'Taka'], minor: ['Poisha', 'Poisha'], system: 'indian' },
  USD: { major: ['Dollar', 'Dollars'], minor: ['Cent', 'Cents'], system: 'international' },
  CAD: { major: ['Dollar', 'Dollars'], minor: ['Cent', 'Cents'], system: 'international' },
  AUD: { major: ['Dollar', 'Dollars'], minor: ['Cent', 'Cents'], system: 'international' },
  SGD: { major: ['Dollar', 'Dollars'], minor: ['Cent', 'Cents'], system: 'international' },
  EUR: { major: ['Euro', 'Euros'], minor: ['Cent', 'Cents'], system: 'international' },
  GBP: { major: ['Pound', 'Pounds'], minor: ['Penny', 'Pence'], system: 'international' },
  AED: { major: ['Dirham', 'Dirhams'], minor: ['Fils', 'Fils'], system: 'international' },
  SAR: { major: ['Riyal', 'Riyals'], minor: ['Halala', 'Halalas'], system: 'international' },
  QAR: { major: ['Riyal', 'Riyals'], minor: ['Dirham', 'Dirhams'], system: 'international' },
  OMR: { major: ['Rial', 'Rials'], minor: ['Baisa', 'Baisa'], system: 'international' },
  KWD: { major: ['Dinar', 'Dinars'], minor: ['Fils', 'Fils'], system: 'international' },
  JPY: { major: ['Yen', 'Yen'], minor: ['Sen', 'Sen'], system: 'international' },
  CNY: { major: ['Yuan', 'Yuan'], minor: ['Fen', 'Fen'], system: 'international' },
  ZAR: { major: ['Rand', 'Rand'], minor: ['Cent', 'Cents'], system: 'international' },
  CHF: { major: ['Franc', 'Francs'], minor: ['Centime', 'Centimes'], system: 'international' },
};

function belowThousand(n) {
  const words = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) words.push(`${ONES[hundreds]} Hundred`);
  if (rest) {
    if (rest < 20) words.push(ONES[rest]);
    else words.push(TENS[Math.floor(rest / 10)] + (rest % 10 ? ` ${ONES[rest % 10]}` : ''));
  }
  return words.join(' ');
}

/** @param {bigint} n */
function indianWords(n) {
  if (n === 0n) return '';
  const parts = [];
  const crore = n / 10000000n;
  let rest = n % 10000000n;
  if (crore > 0n) parts.push(`${indianWords(crore)} Crore`);
  const lakh = Number(rest / 100000n);
  rest %= 100000n;
  if (lakh) parts.push(`${belowThousand(lakh)} Lakh`);
  const thousand = Number(rest / 1000n);
  rest %= 1000n;
  if (thousand) parts.push(`${belowThousand(thousand)} Thousand`);
  if (rest > 0n) parts.push(belowThousand(Number(rest)));
  return parts.join(' ');
}

const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion', 'Quadrillion'];

/** @param {bigint} n */
function internationalWords(n) {
  if (n === 0n) return '';
  const parts = [];
  let i = 0;
  while (n > 0n) {
    const chunk = Number(n % 1000n);
    if (chunk) {
      const scale = i < SCALES.length ? SCALES[i] : '';
      parts.unshift(scale ? `${belowThousand(chunk)} ${scale}` : belowThousand(chunk));
    }
    n /= 1000n;
    i += 1;
  }
  return parts.join(' ');
}

/**
 * Integer → words.
 * @param {bigint|number|string} value
 * @param {'indian'|'international'} [system]
 */
export function numberToWords(value, system = 'indian') {
  let n = BigInt(value);
  if (n === 0n) return 'Zero';
  const negative = n < 0n;
  if (negative) n = -n;
  const words = system === 'indian' ? indianWords(n) : internationalWords(n);
  return negative ? `Minus ${words}` : words;
}

/**
 * Amount in words for a currency.
 * @param {string|number} amount  exact decimal string preferred
 * @param {string} [currency]      ISO code, default INR
 * @param {number} [decimals]      minor-unit digits, default 2
 */
export function amountInWords(amount, currency = 'INR', decimals = 2) {
  const cfg = CURRENCY_WORDS[currency] || {
    major: [currency, currency],
    minor: ['Cent', 'Cents'],
    system: 'international',
  };
  const fixed = toFixed(amount, decimals);
  const negative = fixed.startsWith('-');
  const [intText, fracText = ''] = fixed.replace('-', '').split('.');
  const major = BigInt(intText);
  const minor = fracText ? BigInt(fracText) : 0n;

  const majorWords = `${numberToWords(major, cfg.system)} ${major === 1n ? cfg.major[0] : cfg.major[1]}`;
  let text = majorWords;
  if (minor > 0n) {
    const minorWords = `${numberToWords(minor, cfg.system)} ${minor === 1n ? cfg.minor[0] : cfg.minor[1]}`;
    text = major === 0n ? minorWords : `${majorWords} and ${minorWords}`;
  }
  return `${negative ? 'Minus ' : ''}${text} Only`;
}
