/**
 * Payment receipt and payment voucher: one professional layout for every template.
 *
 *   company (logo, address, contact, GSTIN/PAN)          PAYMENT RECEIPT · No. · Date
 *   Received from (party)                    |  Payment details (mode, reference, date, against invoice)
 *   Amount received — large, with the amount in words
 *   Against invoice: invoice no. / date, taxable value, discount, taxes, invoice total,
 *                    received earlier, this receipt, balance due
 *   Notes · Terms & conditions · Declaration
 *   Received by (party) signature                         For <Company> · Authorised Signatory
 *
 * Professional and Standard draw it boxed, Modern with the accent colour, Simple in black and white.
 * A5 is the same layout drawn smaller (paging.js a5Class), like every other document.
 */

import { TEMPLATE_MAP, getType } from '../config/documentTypes.js';
import { formatDate } from '../utils/dates.js';
import { formatMoney } from '../utils/format.js';
import { amountInWords } from '../utils/numberToWords.js';
import { dec, isZero, sub, toFixed } from '../utils/decimal.js';
import { a5Class } from './paging.js';
import { CancelledMark, CompanyBlock, DocumentFooter, isCancelledDoc, stateLine } from './blocks.jsx';

const lines = (...parts) => parts.filter((p) => p && String(p).trim()).join('\n');

/** Payment details as [label, value] rows (empty ones left out). */
function paymentRows(doc, vendor, dateFormat) {
  const meta = doc.meta || {};
  const cheque = meta.payment_mode === 'Cheque';
  return [
    [vendor ? 'Payment date' : 'Received on', formatDate(doc.issue_date, dateFormat)],
    ['Payment mode', meta.payment_mode],
    [cheque ? 'Cheque no.' : 'Transaction / UTR no.', meta.payment_reference],
    ['Reference', doc.reference],
  ].filter(([, v]) => v && String(v).trim());
}

/**
 * What the receipt settles: the invoice's own figures (when the receipt was made from the invoice list they are
 * stored on the receipt), what was received before, this receipt and the balance.
 */
function settlement(doc) {
  const meta = doc.meta || {};
  if (!meta.against_total) return null;
  const dp = Number(doc.currency_decimals ?? 2);
  const before = meta.received_before || '0';
  const left = sub(sub(meta.against_total, before), doc.grand_total);
  const rows = [];
  const discount = meta.against_discount && !isZero(dec(meta.against_discount));
  const charges = meta.against_charges && !isZero(dec(meta.against_charges));
  if (meta.against_subtotal) rows.push([discount || charges ? 'Invoice value (before discount & charges)' : 'Taxable value', meta.against_subtotal]);
  if (discount) rows.push(['Less: Discount', `-${meta.against_discount}`]);
  if (charges) rows.push(['Add: Additional charges', meta.against_charges]);
  if (meta.against_taxable && (discount || charges)) rows.push(['Taxable value', meta.against_taxable]);
  if (meta.against_tax_mode === 'INTRA') {
    if (meta.against_cgst) rows.push(['CGST', meta.against_cgst]);
    if (meta.against_sgst) rows.push(['SGST', meta.against_sgst]);
  } else if (meta.against_tax_mode === 'INTER') {
    if (meta.against_igst) rows.push(['IGST', meta.against_igst]);
  } else if (meta.against_tax && !isZero(dec(meta.against_tax))) {
    rows.push([meta.against_tax_label || 'Tax', meta.against_tax]);
  }
  if (meta.against_round_off && !isZero(dec(meta.against_round_off))) rows.push(['Round off', meta.against_round_off]);
  return {
    breakup: rows,
    total: meta.against_total,
    before,
    balance: toFixed(left < 0n ? 0n : left, dp),
    settled: left <= 0n,
  };
}

export default function ReceiptDocument({ payload, template, copy, paging }) {
  const { company = {}, document: doc, settings } = payload;
  const ds = settings.doc;
  const type = getType(doc.document_type);
  const vendor = type.partyKind === 'vendor';
  const meta = doc.meta || {};
  const dateFormat = settings.dateFormat;
  const dp = Number(doc.currency_decimals ?? 2);
  const money = (v) => formatMoney(v, doc);
  const settle = settlement(doc);
  const pay = paymentRows(doc, vendor, dateFormat);
  const title = ds.title || type.title;
  const boxed = !!TEMPLATE_MAP[template]?.boxed;
  const invoiceWord = vendor ? 'bill' : 'invoice';

  return (
    <article
      className={`doc doc-receipt-sheet rc rc-${template}${boxed ? ' rc-boxed' : ''}${a5Class(ds, paging)}`}
      style={{ '--doc-accent': template === 'simple' ? '#1b1e24' : settings.documentAccent || '#1f4fd8' }}
      data-testid="receipt-doc"
    >
      <CancelledMark doc={doc} />
      {copy && <div className="doc-copy-label">{copy}</div>}

      <header className="rc-head">
        <div className="rc-company">
          {company.logo && <img className="doc-logo" src={company.logo} alt="" />}
          <CompanyBlock company={company} />
        </div>
        <div className="rc-title">
          <div className="rc-title-text">{title}</div>
          <table className="rc-no">
            <tbody>
              <tr>
                <th>{type.short === 'Receipt' ? 'Receipt No.' : `${type.short} No.`}</th>
                <td data-testid="receipt-number">{doc.document_number || 'Auto'}</td>
              </tr>
              <tr>
                <th>Date</th>
                <td>{formatDate(doc.issue_date, dateFormat)}</td>
              </tr>
            </tbody>
          </table>
          {isCancelledDoc(doc) && <div className="doc-stamp-status">{doc.status}</div>}
        </div>
      </header>

      <section className="rc-parties">
        <div className="rc-box">
          <div className="doc-label">{type.partyLabel}</div>
          <div className="rc-party-name">{doc.party_name || '—'}</div>
          {doc.party_company && doc.party_company !== doc.party_name && <div>{doc.party_company}</div>}
          {doc.party_address && <div className="doc-pre">{doc.party_address}</div>}
          {doc.party_phone && <div>Ph: {doc.party_phone}</div>}
          {doc.party_email && <div>{doc.party_email}</div>}
          {ds.showCustomerTaxId !== false && doc.party_gstin && <div className="doc-ids">GSTIN: {doc.party_gstin}</div>}
          {ds.showCustomerTaxId !== false && doc.party_tax_id && <div className="doc-ids">Tax ID: {doc.party_tax_id}</div>}
          {doc.party_state && <div>State: {stateLine(doc.party_state)}</div>}
        </div>
        <div className="rc-box">
          <div className="doc-label">Payment details</div>
          <table className="rc-kv">
            <tbody>
              {pay.map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
              {meta.against && (
                <tr>
                  <th>Against {invoiceWord}</th>
                  <td>
                    <strong>{meta.against}</strong>
                    {meta.against_date ? ` dated ${formatDate(meta.against_date, dateFormat)}` : ''}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rc-amount" data-testid="receipt-amount">
        <div>
          <div className="rc-amount-label">{vendor ? 'Amount Paid' : 'Amount Received'}</div>
          <div className="rc-amount-words">
            {doc.currency} {amountInWords(doc.grand_total, doc.currency, dp)}
          </div>
        </div>
        <div className="rc-amount-value">{money(doc.grand_total)}</div>
      </section>

      <p className="rc-sentence">
        {vendor ? 'Paid to' : 'Received with thanks from'} <strong>{doc.party_name || '—'}</strong> the sum of <strong>{money(doc.grand_total)}</strong>
        {meta.payment_mode ? (
          <>
            {' '}
            by <strong>{meta.payment_mode}</strong>
          </>
        ) : null}
        {meta.payment_reference ? ` (Ref: ${meta.payment_reference})` : ''}
        {meta.against ? (
          <>
            {' '}
            against {invoiceWord} <strong>{meta.against}</strong>
          </>
        ) : null}{' '}
        on {formatDate(doc.issue_date, dateFormat)}.
      </p>

      {settle && (
        <table className="rc-settle" data-testid="receipt-settlement">
          <thead>
            <tr>
              <th>
                {vendor ? 'Bill' : 'Invoice'} {meta.against}
                {meta.against_date ? ` · ${formatDate(meta.against_date, dateFormat)}` : ''}
              </th>
              <th className="c-num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {settle.breakup.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td className="c-num">{money(v)}</td>
              </tr>
            ))}
            <tr className="rc-settle-total">
              <td>{vendor ? 'Bill' : 'Invoice'} total</td>
              <td className="c-num">{money(settle.total)}</td>
            </tr>
            <tr>
              <td>Less: {vendor ? 'Paid' : 'Received'} earlier</td>
              <td className="c-num">{money(settle.before)}</td>
            </tr>
            <tr>
              <td>Less: This {vendor ? 'payment' : 'receipt'}</td>
              <td className="c-num">
                <strong>{money(doc.grand_total)}</strong>
              </td>
            </tr>
            <tr className="rc-settle-balance">
              <td>Balance due</td>
              <td className="c-num">{settle.settled ? 'Nil — fully paid' : money(settle.balance)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {(doc.notes?.trim() || doc.terms?.trim()) && (
        <section className="rc-terms">
          {doc.notes?.trim() && (
            <div>
              <div className="doc-label">Notes</div>
              <div className="doc-pre">{doc.notes}</div>
            </div>
          )}
          {doc.terms?.trim() && (
            <div>
              <div className="doc-label">Terms &amp; Conditions</div>
              <div className="doc-pre">{doc.terms}</div>
            </div>
          )}
        </section>
      )}
      {ds.showDeclaration !== false && ds.declaration?.trim() && (
        <div className="rc-declaration">
          <div className="doc-label">Declaration</div>
          <div className="doc-pre">{ds.declaration}</div>
        </div>
      )}

      <section className="rc-sign">
        <div className="rc-sign-col">
          <div className="doc-sign-space" />
          <div className="doc-sign-line">{vendor ? "Receiver's Signature" : 'Customer Signature'}</div>
        </div>
        {ds.showSignature !== false && (
          <div className="rc-sign-col rc-sign-right">
            <div className="doc-sign-for">For {company.name || 'Your Company'}</div>
            <div className="doc-sign-space">
              {ds.showStamp !== false && company.stamp && <img className="doc-stamp" src={company.stamp} alt="" />}
              {company.signature && <img className="doc-signature" src={company.signature} alt="" />}
            </div>
            <div className="doc-sign-line">Authorised Signatory</div>
          </div>
        )}
      </section>
      <DocumentFooter text={lines(settings.footerText)} jurisdiction={settings.jurisdiction} />
    </article>
  );
}
