import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dec, toFixed, add, mul, percentOf, round } from '../src/utils/decimal.js';
import { calcLine, calcDocument, exclusivePrice } from '../src/utils/calc.js';
import { amountInWords, numberToWords } from '../src/utils/numberToWords.js';
import { formatAmount } from '../src/utils/format.js';
import { formatDate, rangeFor } from '../src/utils/dates.js';

test('decimal arithmetic is exact', () => {
  assert.equal(toFixed(add('0.1', '0.2'), 2), '0.30');
  assert.equal(toFixed(add(0.1, 0.2), 6), '0.300000');
  assert.equal(toFixed(mul('19.99', '3'), 2), '59.97');
  assert.equal(toFixed(percentOf('1000', '18'), 2), '180.00');
  assert.equal(toFixed(round('2.345', 2), 2), '2.35');
  assert.equal(toFixed(round('-2.345', 2), 2), '-2.35');
  assert.equal(toFixed(dec('abc'), 2), '0.00');
  assert.equal(toFixed(dec('1,234.5'), 2), '1234.50');
});

test('GST intra-state split: 1000 @ 18% → CGST 90 + SGST 90', () => {
  const line = calcLine({ quantity: '1', unit_price: '1000', tax_rate: '18' }, { taxMode: 'INTRA' });
  assert.equal(line.cgst_amount, '90.00');
  assert.equal(line.sgst_amount, '90.00');
  assert.equal(line.tax_amount, '180.00');
  assert.equal(line.total_amount, '1180.00');
});

test('GST inter-state: IGST 18%', () => {
  const line = calcLine({ quantity: '2', unit_price: '500', tax_rate: '18' }, { taxMode: 'INTER' });
  assert.equal(line.igst_amount, '180.00');
  assert.equal(line.total_amount, '1180.00');
});

test('discounts (percent and amount)', () => {
  const p = calcLine({ quantity: '10', unit_price: '100', discount_value: '10', discount_type: 'PERCENT', tax_rate: '5' });
  assert.equal(p.discount_amount, '100.00');
  assert.equal(p.taxable_amount, '900.00');
  assert.equal(p.tax_amount, '45.00');
  const a = calcLine({ quantity: '1', unit_price: '100', discount_value: '500', discount_type: 'AMOUNT', tax_rate: '0' });
  assert.equal(a.discount_amount, '100.00');
  assert.equal(a.total_amount, '0.00');
});

test('document totals with shipping and auto round off', () => {
  const { totals, taxes } = calcDocument(
    { tax_mode: 'INTRA', shipping: '50', other_charges: '0' },
    [
      { quantity: '3', unit_price: '333.33', tax_rate: '18' },
      { quantity: '1', unit_price: '99.99', tax_rate: '5' },
    ],
    { roundOffMode: 'AUTO' },
  );
  assert.equal(totals.subtotal, '1099.98');
  assert.equal(totals.tax, '185.00');
  assert.equal(totals.round_off, '0.02');
  assert.equal(totals.grand_total, '1335.00');
  assert.equal(taxes.length, 2);
  assert.equal(taxes[1].tax_rate, '18');
});

test('tax-inclusive price converts back exactly', () => {
  const price = exclusivePrice('1000', '18');
  const line = calcLine({ quantity: '1', unit_price: price, tax_rate: '18' });
  assert.equal(line.total_amount, '1000.00');
});

test('number to words (Indian)', () => {
  assert.equal(amountInWords('12450.00', 'INR'), 'Twelve Thousand Four Hundred Fifty Rupees Only');
  assert.equal(amountInWords('125000', 'INR'), 'One Lakh Twenty Five Thousand Rupees Only');
  assert.equal(amountInWords('10.50', 'INR'), 'Ten Rupees and Fifty Paise Only');
  assert.equal(amountInWords('1', 'INR'), 'One Rupee Only');
  assert.equal(amountInWords('0.75', 'INR'), 'Seventy Five Paise Only');
  assert.equal(amountInWords('123456789', 'INR'), 'Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Rupees Only');
  assert.equal(numberToWords(0), 'Zero');
});

test('number to words (international)', () => {
  assert.equal(amountInWords('1250000', 'USD'), 'One Million Two Hundred Fifty Thousand Dollars Only');
  assert.equal(amountInWords('99.01', 'GBP'), 'Ninety Nine Pounds and One Penny Only');
});

test('amount formatting', () => {
  assert.equal(formatAmount('1234567.5', { currency: 'INR', symbol: '₹' }), '₹12,34,567.50');
  assert.equal(formatAmount('1234567.5', { currency: 'USD', symbol: '$' }), '$1,234,567.50');
  assert.equal(formatAmount('-50', { currency: 'INR' }), '-50.00');
});

test('dates', () => {
  assert.equal(formatDate('2026-09-24', 'DD MMM YYYY'), '24 Sep 2026');
  assert.equal(formatDate('2026-09-24'), '24-09-2026');
  assert.deepEqual(rangeFor('all'), { from: '', to: '' });
});
