/**
 * Reusable building blocks of a printed document. Every document type is
 * rendered from these components; what is shown is decided by the resolved
 * per-type settings (`settings.doc`) and the document type definition.
 *
 * All text is rendered through React (escaped); no raw HTML is ever injected.
 */

import { formatMoney, formatQty, formatRate } from '../utils/format.js';
import { formatDate } from '../utils/dates.js';
import { amountInWords } from '../utils/numberToWords.js';
import { dec, div, isZero, sub, toFixed, toPlain } from '../utils/decimal.js';
import { EXTRA_FIELDS, getType } from '../config/documentTypes.js';
import { stateCode } from '../config/states.js';

const lines = (...parts) => parts.filter((p) => p && String(p).trim()).join('\n');

/** "Maharashtra, Code: 27" (GST state code when known). */
export const stateLine = (state) => {
  if (!state) return '';
  const code = stateCode(state);
  return code ? `${state}, Code: ${code}` : state;
};

/** Filled "additional details" of a document as [label, value] pairs. */
export function extraDetails(doc, type, dateFormat) {
  const meta = doc.meta || {};
  return type.optional
    .filter((k) => k !== 'reverseCharge' && meta[k] && String(meta[k]).trim())
    .map((k) => [EXTRA_FIELDS[k]?.label || k, EXTRA_FIELDS[k]?.type === 'date' ? formatDate(meta[k], dateFormat) : meta[k]]);
}

export const isCancelledDoc = (doc) => doc.status === 'CANCELLED' || doc.status === 'VOID';

/** Large diagonal CANCELLED mark over the page (screen and print). */
export function CancelledMark({ doc }) {
  if (!isCancelledDoc(doc)) return null;
  return (
    <div className="doc-watermark" aria-hidden="true">
      {doc.status === 'VOID' ? 'VOID' : 'CANCELLED'}
    </div>
  );
}

export function CompanyBlock({ company }) {
  const cityLine = [company.city, company.state, company.pin].filter(Boolean).join(', ');
  const contact = [company.phone && `Ph: ${company.phone}`, company.email].filter(Boolean).join('  |  ');
  const ids = [
    company.gstin && `GSTIN: ${company.gstin}`,
    company.pan && `PAN: ${company.pan}`,
    company.vat_number && `VAT: ${company.vat_number}`,
  ].filter(Boolean);
  return (
    <div className="doc-company">
      <div className="doc-company-name">{company.name || 'Your Company'}</div>
      {company.legal_name && company.legal_name !== company.name && <div className="doc-company-legal">{company.legal_name}</div>}
      <div className="doc-pre">{lines(company.address, cityLine, company.country !== 'India' ? company.country : '')}</div>
      {contact && <div>{contact}</div>}
      {company.website && <div>{company.website}</div>}
      {ids.length > 0 && <div className="doc-ids">{ids.join('  |  ')}</div>}
      {company.gstin && company.state && <div>State Name: {stateLine(company.state)}</div>}
    </div>
  );
}

export function DocumentHeader({ company, title, doc }) {
  return (
    <header className="doc-header">
      <div className="doc-header-left">
        {company.logo && <img className="doc-logo" src={company.logo} alt="" />}
        <CompanyBlock company={company} />
      </div>
      <div className="doc-header-right">
        <div className="doc-title">{title}</div>
        {isCancelledDoc(doc) ? <div className="doc-stamp-status">{doc.status}</div> : null}
      </div>
    </header>
  );
}

export function PartyBlock({ doc, label, showTaxId }) {
  return (
    <div className="doc-party">
      <div className="doc-label">{label}</div>
      <div className="doc-party-name">{doc.party_name || '—'}</div>
      {doc.party_company && doc.party_company !== doc.party_name && <div>{doc.party_company}</div>}
      <div className="doc-pre">{doc.party_address}</div>
      {doc.party_phone && <div>Ph: {doc.party_phone}</div>}
      {doc.party_email && <div>{doc.party_email}</div>}
      {showTaxId && doc.party_gstin && <div className="doc-ids">GSTIN: {doc.party_gstin}</div>}
      {showTaxId && doc.party_tax_id && <div className="doc-ids">Tax ID: {doc.party_tax_id}</div>}
      {doc.party_state && <div>State: {stateLine(doc.party_state)}</div>}
    </div>
  );
}

export function ShippingBlock({ doc }) {
  if (!doc.shipping_address?.trim()) return null;
  return (
    <div className="doc-party">
      <div className="doc-label">Ship To</div>
      <div className="doc-pre">{doc.shipping_address}</div>
    </div>
  );
}

export function DocumentMeta({ doc, type, dateFormat, parent, baseCurrency }) {
  const rows = [
    [`${type.short} No.`, doc.document_number || 'Auto'],
    [type.dateLabel, formatDate(doc.issue_date, dateFormat)],
  ];
  if (type.dueLabel && doc.due_date) rows.push([type.dueLabel, formatDate(doc.due_date, dateFormat)]);
  if (doc.reference) rows.push(['Reference', doc.reference]);
  if (doc.place_of_supply) rows.push(['Place of Supply', stateLine(doc.place_of_supply)]);
  rows.push(...extraDetails(doc, type, dateFormat));
  if (doc.meta?.reverseCharge === 'Yes') rows.push(['Reverse Charge', 'Yes']);
  if (parent?.document_number) rows.push(['Created From', parent.document_number]);
  if (doc.currency && baseCurrency && doc.currency !== baseCurrency) {
    rows.push(['Currency', `${doc.currency} (1 ${doc.currency} = ${doc.exchange_rate} ${baseCurrency})`]);
  }
  return (
    <div className="doc-meta">
      {rows.map(([k, v]) => (
        <div className="doc-meta-row" key={k}>
          <span className="doc-meta-key">{k}</span>
          <span className="doc-meta-val">{v}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Item table. The optional props are used when the Modern template is laid out page by page (paging.js):
 * start (numbering offset), colWidths (fixed column widths so every page wraps alike), hideFoot, noEmptyRow, fill (height of
 * the empty ruled space that stretches the table to the foot of the page).
 */
export function ItemsTable({ items, doc, ds, start = 0, colWidths, hideFoot = false, noEmptyRow = false, fill = 0 }) {
  const money = (v) => formatMoney(v, { ...doc, currency_symbol: '' });
  const showTax = ds.showTax !== false && doc.tax_mode !== 'NONE';
  const showPrices = ds.showPrices !== false;
  const showDiscount = showPrices && items.some((i) => !isZero(i.discount_amount));
  const showHsn = ds.showHsn !== false && items.some((i) => i.hsn_sac);
  const showPackage = ds.showPackage && items.some((i) => i.package_info);
  return (
    <table className="doc-items" style={colWidths ? { tableLayout: 'fixed' } : undefined}>
      {colWidths && (
        <colgroup>
          {colWidths.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
      )}
      <thead>
        <tr>
          <th className="c-sn">#</th>
          <th className="c-item">Item &amp; Description</th>
          {showHsn && <th className="c-hsn">HSN/SAC</th>}
          <th className="c-num">Qty</th>
          {showPackage && <th className="c-pkg">Package</th>}
          {showPrices && <th className="c-num">Rate</th>}
          {showDiscount && <th className="c-num">Discount</th>}
          {showPrices && showTax && <th className="c-num">{doc.tax_label || 'Tax'} %</th>}
          {showPrices && showTax && <th className="c-num">Tax Amt</th>}
          {showPrices && <th className="c-num c-amt">Amount</th>}
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => (
          <tr key={it._key || it.id || i} className="doc-item-row">
            <td className="c-sn">{start + i + 1}</td>
            <td className="c-item">
              <div className="doc-item-name">{it.name}</div>
              {it.description && <div className="doc-item-desc">{it.description}</div>}
            </td>
            {showHsn && <td className="c-hsn">{it.hsn_sac}</td>}
            <td className="c-num">
              {formatQty(it.quantity)} {it.unit}
            </td>
            {showPackage && <td className="c-pkg">{it.package_info}</td>}
            {showPrices && <td className="c-num">{money(it.unit_price)}</td>}
            {showDiscount && (
              <td className="c-num">
                {isZero(it.discount_amount) ? '—' : money(it.discount_amount)}
                {it.discount_type === 'PERCENT' && !isZero(it.discount_value) && (
                  <div className="doc-sub">{formatRate(it.discount_value)}%</div>
                )}
              </td>
            )}
            {showPrices && showTax && <td className="c-num">{formatRate(it.tax_rate)}%</td>}
            {showPrices && showTax && <td className="c-num">{money(it.tax_amount)}</td>}
            {showPrices && <td className="c-num c-amt">{money(showTax ? it.total_amount : it.taxable_amount)}</td>}
          </tr>
        ))}
        {items.length === 0 && !noEmptyRow && (
          <tr>
            <td className="doc-empty-row" colSpan={10}>
              No items added yet
            </td>
          </tr>
        )}
        {fill > 0 && colWidths && (
          <tr className="doc-fill-row" style={{ height: fill }}>
            {colWidths.map((_, i) => (
              <td key={i} />
            ))}
          </tr>
        )}
      </tbody>
      {!showPrices && items.length > 0 && !hideFoot && (
        <tfoot>
          <tr>
            <td colSpan={showHsn ? 3 : 2} className="c-right">
              Total Quantity
            </td>
            <td className="c-num">{formatQty(items.reduce((a, it) => a + dec(it.quantity), 0n))}</td>
            {showPackage && <td />}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

export function TaxSummary({ taxes, doc }) {
  if (!taxes?.length) return null;
  const money = (v) => formatMoney(v, { ...doc, currency_symbol: '' });
  const intra = doc.tax_mode === 'INTRA';
  const inter = doc.tax_mode === 'INTER';
  const half = (r) => toPlain(div(r, 2));
  return (
    <table className="doc-taxes">
      <thead>
        <tr>
          <th>{doc.tax_label || 'Tax'} Rate</th>
          <th className="c-num">Taxable Value</th>
          {intra && <th className="c-num">CGST</th>}
          {intra && <th className="c-num">SGST</th>}
          {inter && <th className="c-num">IGST</th>}
          <th className="c-num">Total Tax</th>
        </tr>
      </thead>
      <tbody>
        {taxes.map((t) => (
          <tr key={t.tax_rate}>
            <td>{formatRate(t.tax_rate)}%</td>
            <td className="c-num">{money(t.taxable_amount)}</td>
            {intra && (
              <td className="c-num">
                {money(t.cgst)} <span className="doc-sub-inline">@{half(t.tax_rate)}%</span>
              </td>
            )}
            {intra && (
              <td className="c-num">
                {money(t.sgst)} <span className="doc-sub-inline">@{half(t.tax_rate)}%</span>
              </td>
            )}
            {inter && <td className="c-num">{money(t.igst)}</td>}
            <td className="c-num">{money(t.tax_amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TotalsSummary({ doc, ds }) {
  const m = (v) => formatMoney(v, doc);
  const showTax = ds.showTax !== false && doc.tax_mode !== 'NONE';
  const rows = [['Subtotal', m(doc.subtotal)]];
  if (!isZero(doc.discount)) rows.push(['Discount', `- ${m(doc.discount)}`]);
  if (showTax) {
    if (doc.tax_mode === 'INTRA') {
      rows.push(['CGST', m(doc.cgst)]);
      rows.push(['SGST', m(doc.sgst)]);
    } else if (doc.tax_mode === 'INTER') {
      rows.push(['IGST', m(doc.igst)]);
    } else {
      rows.push([doc.tax_label || 'Tax', m(doc.tax)]);
    }
  }
  if (!isZero(doc.shipping)) rows.push(['Shipping', m(doc.shipping)]);
  if (!isZero(doc.other_charges)) rows.push([doc.other_charges_label || 'Other charges', m(doc.other_charges)]);
  if (!isZero(doc.round_off)) rows.push(['Round Off', m(doc.round_off)]);
  return (
    <div className="doc-totals">
      {rows.map(([k, v]) => (
        <div className="doc-total-row" key={k}>
          <span>{k}</span>
          <span>{v}</span>
        </div>
      ))}
      <div className="doc-total-row doc-grand">
        <span>Grand Total</span>
        <span>{m(doc.grand_total)}</span>
      </div>
    </div>
  );
}

export function AmountInWords({ doc }) {
  return (
    <div className="doc-words">
      <span className="doc-label">Amount in words</span>
      <div className="doc-words-text">{amountInWords(doc.grand_total, doc.currency, Number(doc.currency_decimals ?? 2))}</div>
    </div>
  );
}

export function BankDetails({ company }) {
  const rows = [
    ['Bank', company.bank_name],
    ['A/c Holder', company.account_holder],
    ['A/c No.', company.account_number],
    ['IFSC', company.ifsc],
    ['SWIFT', company.swift],
    ['IBAN', company.iban],
    ['Branch', company.branch],
    ['UPI', company.upi_id],
  ].filter(([, v]) => v);
  if (!rows.length) return null;
  return (
    <div className="doc-bank">
      <div className="doc-label">Bank Details</div>
      {rows.map(([k, v]) => (
        <div className="doc-meta-row" key={k}>
          <span className="doc-meta-key">{k}</span>
          <span className="doc-meta-val">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function QrBlock({ src, caption }) {
  if (!src) return null;
  return (
    <div className="doc-qr">
      <img src={src} alt="QR code" />
      {caption && <div className="doc-sub">{caption}</div>}
    </div>
  );
}

export function TermsAndConditions({ notes, terms }) {
  if (!notes?.trim() && !terms?.trim()) return null;
  return (
    <div className="doc-terms">
      {notes?.trim() && (
        <div>
          <div className="doc-label">Notes</div>
          <div className="doc-pre">{notes}</div>
        </div>
      )}
      {terms?.trim() && (
        <div>
          <div className="doc-label">Terms &amp; Conditions</div>
          <div className="doc-pre">{terms}</div>
        </div>
      )}
    </div>
  );
}

export function SignatureBlock({ company, ds, receiverSignature }) {
  return (
    <div className="doc-signatures">
      {receiverSignature ? (
        <div className="doc-sign doc-sign-left">
          <div className="doc-sign-space" />
          <div className="doc-sign-line">Receiver&apos;s Signature</div>
        </div>
      ) : (
        <div />
      )}
      {ds.showSignature !== false && (
        <div className="doc-sign">
          <div className="doc-sign-for">For {company.name || 'Your Company'}</div>
          <div className="doc-sign-space">
            {ds.showStamp !== false && company.stamp && <img className="doc-stamp" src={company.stamp} alt="" />}
            {company.signature && <img className="doc-signature" src={company.signature} alt="" />}
          </div>
          <div className="doc-sign-line">Authorised Signatory</div>
        </div>
      )}
    </div>
  );
}

export function Declaration({ text }) {
  if (!text?.trim()) return null;
  return (
    <div className="doc-declaration">
      <div className="doc-label">Declaration</div>
      <div className="doc-pre">{text}</div>
    </div>
  );
}

export function DocumentFooter({ text, jurisdiction }) {
  if (!text && !jurisdiction) return null;
  return (
    <footer className="doc-footer">
      {jurisdiction && <div className="doc-jurisdiction">SUBJECT TO {jurisdiction.toUpperCase()} JURISDICTION</div>}
      {text && <div>{text}</div>}
    </footer>
  );
}

/** Payment receipt body: the receipt sentence, payment details and — against an invoice — what is still due. */
export function ReceiptBody({ doc, dateFormat }) {
  const meta = doc.meta || {};
  const type = getType(doc.document_type);
  const vendor = type.partyKind === 'vendor';
  const dp = Number(doc.currency_decimals ?? 2);
  const settled = !!meta.against_total;
  const before = meta.received_before || '0';
  const due = settled ? toFixed(sub(meta.against_total, before), dp) : null;
  const left = settled ? sub(due, doc.grand_total) : 0n;
  const balance = toFixed(left < 0n ? 0n : left, dp);
  const details = [
    ['Payment mode', meta.payment_mode],
    [meta.payment_mode === 'Cheque' ? 'Cheque no.' : 'Transaction / ref. no.', meta.payment_reference],
    [vendor ? 'Against bill' : 'Against invoice', meta.against],
    [vendor ? 'Bill date' : 'Invoice date', meta.against_date ? formatDate(meta.against_date, dateFormat) : ''],
  ].filter(([, v]) => v);
  return (
    <div className="doc-receipt">
      <p className="doc-receipt-text">
        {vendor ? 'Paid to' : 'Received with thanks from'} <strong>{doc.party_name || '—'}</strong>
        {doc.party_company && doc.party_company !== doc.party_name ? ` (${doc.party_company})` : ''} the sum of{' '}
        <strong>{formatMoney(doc.grand_total, doc)}</strong> (
        {amountInWords(doc.grand_total, doc.currency, dp)})
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
            against <strong>{meta.against}</strong>
          </>
        ) : null}{' '}
        on {formatDate(doc.issue_date, dateFormat)}.
      </p>
      {details.length > 0 && (
        <table className="doc-receipt-details">
          <tbody>
            {details.map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {settled && (
        <table className="doc-receipt-settle" data-testid="receipt-settlement">
          <thead>
            <tr>
              <th>{vendor ? 'Bill' : 'Invoice'} amount</th>
              <th>{vendor ? 'Paid' : 'Received'} earlier</th>
              <th>This {vendor ? 'payment' : 'receipt'}</th>
              <th>Balance due</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{formatMoney(meta.against_total, doc)}</td>
              <td>{formatMoney(before, doc)}</td>
              <td>
                <strong>{formatMoney(doc.grand_total, doc)}</strong>
              </td>
              <td>
                <strong>{left > 0n ? formatMoney(balance, doc) : 'Nil — fully paid'}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      )}
      <div className="doc-receipt-amount">
        <span>{vendor ? 'Amount Paid' : type.short === 'Receipt' ? 'Amount Received' : 'Amount'}</span>
        <strong>{formatMoney(doc.grand_total, doc)}</strong>
      </div>
    </div>
  );
}

/** Pages 2, 3 … of a long bill: a short header instead of the full one. */
export function ContinuationHead({ company, title, doc }) {
  return (
    <div className="doc-cont-head">
      <strong>{company.name || 'Your Company'}</strong>
      <span>
        {title} {doc.document_number} <em>(continued)</em>
      </span>
    </div>
  );
}

/** Foot of the item list on every page but the last. */
export function ContinuedNote({ next }) {
  return <div className="doc-cont-note">Continued on page {next} …</div>;
}

/** "Page 1 of 3" at the foot of every page of a multi-page bill. */
export function PageFooter({ label, pageNo, pageCount }) {
  return (
    <div className="doc-page-foot">
      <span>{label}</span>
      <span>
        Page {pageNo} of {pageCount}
      </span>
    </div>
  );
}
