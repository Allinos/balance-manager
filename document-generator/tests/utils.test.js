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

test('additional charges: several rows, each taxed at its own rate, in the totals and GST summary', async () => {
  const { calcDocument, chargeLines } = await import('../src/utils/calc.js');
  const items = [{ quantity: '2', unit_price: '1000', discount_value: '10', discount_type: 'PERCENT', tax_rate: '18' }];
  const doc = {
    tax_mode: 'INTRA',
    shipping: '0',
    other_charges: '0',
    meta: { charges: [{ label: 'Freight', amount: '500', tax_rate: '18' }, { label: 'Packing', amount: '100', tax_rate: '0' }, { label: '', amount: '', tax_rate: '5' }] },
  };
  const { totals, taxes, charges } = calcDocument(doc, items, { roundOffMode: 'NONE' });
  // Items 2,000 − 10 % = 1,800; charges 500 @ 18 % + 100 @ 0 %; tax 18 % of 2,300 = 414.
  assert.equal(totals.subtotal, '2000.00');
  assert.equal(totals.discount, '200.00');
  assert.equal(totals.other_charges, '600.00');
  assert.equal(totals.taxable, '2400.00');
  assert.equal(totals.cgst, '207.00');
  assert.equal(totals.sgst, '207.00');
  assert.equal(totals.tax, '414.00');
  assert.equal(totals.shipping, '0.00');
  assert.equal(totals.grand_total, '2814.00');
  assert.deepEqual(charges.map((c) => [c.label, c.amount, c.tax_amount]), [['Freight', '500.00', '90.00'], ['Packing', '100.00', '0.00']]);
  assert.deepEqual(taxes.map((t) => [t.tax_rate, t.taxable_amount, t.tax_amount]), [['0', '100.00', '0.00'], ['18', '2300.00', '414.00']]);
  // A minus amount works as a deduction; IGST for another state.
  const deduct = calcDocument({ ...doc, tax_mode: 'INTER', meta: { charges: [{ label: 'Advance received', amount: '-1000', tax_rate: '0' }] } }, items, { roundOffMode: 'NONE' });
  assert.equal(deduct.totals.igst, '324.00');
  assert.equal(deduct.totals.grand_total, '1124.00');
  // The printed document works the lines out from the stored document the same way.
  assert.deepEqual(chargeLines({ ...doc, currency_decimals: 2 }).map((c) => c.total_amount), ['590.00', '100.00']);
});

test('older documents keep their single shipping and other charges (added after tax)', async () => {
  const { calcDocument } = await import('../src/utils/calc.js');
  const items = [{ quantity: '1', unit_price: '1000', tax_rate: '18' }];
  const { totals } = calcDocument({ tax_mode: 'INTRA', shipping: '100', other_charges: '50', meta: {} }, items, { roundOffMode: 'NONE' });
  assert.equal(totals.tax, '180.00');
  assert.equal(totals.grand_total, '1330.00');
  const { withCharges } = await import('../src/services/documentService.js');
  const edited = withCharges({ shipping: '100', other_charges: '50', other_charges_label: 'Loading', tax_mode: 'INTRA', meta: {} });
  assert.deepEqual(edited.meta.charges.map((c) => [c.label, c.amount, c.tax_rate]), [['Shipping', '100', '0'], ['Loading', '50', '0']]);
  const again = calcDocument(edited, items, { roundOffMode: 'NONE' });
  assert.equal(again.totals.grand_total, '1330.00');
});
