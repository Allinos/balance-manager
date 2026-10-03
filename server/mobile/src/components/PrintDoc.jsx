/** The printed document (A4). Shown scaled to the screen; printed at full size. */

import { STATUS_LABELS, money, shortDate, typeOf } from '../lib/docs.js';
import { amountInWords } from '../lib/numberToWords.js';
import { qrDataUrl, upiLink } from '../lib/qr.js';
import { stateCode } from '../lib/states.js';

export default function PrintDoc({ doc, company }) {
  const type = typeOf(doc.type);
  const prices = type.prices !== false;
  const t = doc.totals || {};
  const taxed = doc.taxMode && doc.taxMode !== 'NONE';
  const hasBank = company.accountNumber || company.upi;
  const showBank = prices && hasBank && (type.bankOption ? doc.showBank : type.bank);
  const qr = showBank && type.qr && company.upi ? qrDataUrl(upiLink({ upiId: company.upi, payee: company.name, amount: t.grand_total, note: doc.number })) : '';
  return (
    <article className="print-doc" data-testid="print-doc">
      <header className="pd-head">
        <div className="pd-company">
          <h2>{company.name}</h2>
          {company.address && <div style={{ whiteSpace: 'pre-line' }}>{company.address}</div>}
          {company.state && (
            <div>
              {company.state}
              {stateCode(company.state) ? `, Code: ${stateCode(company.state)}` : ''}
            </div>
          )}
          {company.gstin && <div>GSTIN: {company.gstin}</div>}
          {(company.phone || company.email) && <div>{[company.phone, company.email].filter(Boolean).join(' · ')}</div>}
        </div>
        <div className="pd-title">
          <h1>{type.title}</h1>
          {doc.status === 'CANCELLED' && <div className="pd-cancelled">{STATUS_LABELS.CANCELLED.toUpperCase()}</div>}
        </div>
      </header>

      <section className="pd-parties">
        <div>
          <div className="pd-label">{type.party}</div>
          <strong style={{ fontSize: 14 }}>{doc.party.name}</strong>
          {doc.party.address && <div style={{ whiteSpace: 'pre-line' }}>{doc.party.address}</div>}
          {doc.party.state && (
            <div>
              {doc.party.state}
              {stateCode(doc.party.state) ? `, Code: ${stateCode(doc.party.state)}` : ''}
            </div>
          )}
          {doc.party.gstin && <div>GSTIN: {doc.party.gstin}</div>}
          {doc.party.phone && <div>Phone: {doc.party.phone}</div>}
        </div>
        <dl className="pd-meta">
          <dt>{type.short} No.</dt>
          <dd>{doc.number}</dd>
          <dt>Date</dt>
          <dd>{shortDate(doc.date)}</dd>
          {type.dueLabel && doc.dueDate && (
            <>
              <dt>{type.dueLabel}</dt>
              <dd>{shortDate(doc.dueDate)}</dd>
            </>
          )}
          {taxed && doc.placeOfSupply && (
            <>
              <dt>Place of supply</dt>
              <dd>
                {doc.placeOfSupply}
                {stateCode(doc.placeOfSupply) ? ` (${stateCode(doc.placeOfSupply)})` : ''}
              </dd>
            </>
          )}
        </dl>
      </section>

      <table className="pd-table">
        <thead>
          <tr>
            <th style={{ width: 28 }}>#</th>
            <th>Item</th>
            <th>HSN/SAC</th>
            <th className="r">Qty</th>
            {prices && <th className="r">Rate</th>}
            {prices && taxed && <th className="r">GST</th>}
            {prices && <th className="r">Amount</th>}
          </tr>
        </thead>
        <tbody>
          {doc.items.map((it, n) => (
            <tr key={it.key || n}>
              <td>{n + 1}</td>
              <td>{it.name}</td>
              <td>{it.hsn}</td>
              <td className="r">
                {it.qty} {it.unit}
              </td>
              {prices && <td className="r">{money(it.rate, { symbol: false })}</td>}
              {prices && taxed && <td className="r">{it.taxRate}%</td>}
              {prices && <td className="r">{money(Number(it.qty || 0) * Number(it.rate || 0), { symbol: false })}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {prices && (
        <section className="pd-bottom">
          <div>
            <div className="pd-label">Amount in words</div>
            <div className="pd-words">{amountInWords(t.grand_total, 'INR')}</div>
          </div>
          <div className="pd-totals">
            <div>
              <span>Taxable value</span>
              <span>{money(t.taxable)}</span>
            </div>
            {doc.taxMode === 'INTRA' && (
              <>
                <div>
                  <span>CGST</span>
                  <span>{money(t.cgst)}</span>
                </div>
                <div>
                  <span>SGST</span>
                  <span>{money(t.sgst)}</span>
                </div>
              </>
            )}
            {doc.taxMode === 'INTER' && (
              <div>
                <span>IGST</span>
                <span>{money(t.igst)}</span>
              </div>
            )}
            {Number(t.round_off) !== 0 && (
              <div>
                <span>Round off</span>
                <span>{money(t.round_off)}</span>
              </div>
            )}
            <div className="grand">
              <span>Total</span>
              <span>{money(t.grand_total)}</span>
            </div>
          </div>
        </section>
      )}

      {showBank && (
        <section className="pd-pay" data-testid="pd-bank">
          <div style={{ flex: 1 }}>
            <div className="pd-label">Bank details</div>
            {company.accountName && <div>A/c name: {company.accountName}</div>}
            {company.bankName && <div>Bank: {company.bankName}</div>}
            {company.accountNumber && <div>A/c no.: {company.accountNumber}</div>}
            {company.ifsc && <div>IFSC: {company.ifsc}</div>}
            {company.upi && <div>UPI: {company.upi}</div>}
          </div>
          {qr && (
            <div className="center" data-testid="pd-upi-qr">
              <img src={qr} alt="UPI QR code" />
              <div style={{ fontSize: 10.5 }}>Scan to pay (UPI)</div>
            </div>
          )}
        </section>
      )}

      {(doc.notes || doc.terms) && (
        <section className="pd-terms">
          {doc.notes && <div>{doc.notes}</div>}
          {doc.terms && (
            <>
              <div className="pd-label" style={{ marginTop: 10 }}>
                Terms &amp; conditions
              </div>
              <div>{doc.terms}</div>
            </>
          )}
        </section>
      )}
      <div className="pd-sign">
        <div>for {company.name}</div>
        <div className="line">Authorised Signatory</div>
      </div>
    </article>
  );
}
