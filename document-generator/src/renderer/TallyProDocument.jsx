/**
 * "Tally Professional" template — a boxed GST invoice modelled on the layout
 * Indian businesses know from Tally, with every particular required by
 * CGST Rule 46 (tax invoice) / Rule 49 (bill of supply) / Rule 53 (credit &
 * debit notes) / Rule 55 (delivery challan):
 *
 *   supplier name, address, GSTIN, state name & code, PAN · consecutive
 *   invoice number (≤16 chars) and date · recipient name, address, GSTIN,
 *   state name & code · consignee (ship-to) when different · place of supply
 *   with state code · HSN/SAC · description · quantity & unit · rate ·
 *   discount · taxable value · rate and amount of CGST/SGST or IGST ·
 *   reverse charge Yes/No · HSN/SAC-wise tax summary · amount and tax amount
 *   in words · declaration · bank details · "for <Company>" + Authorised
 *   Signatory · jurisdiction · E. & O.E.
 *
 * It is not a copy of Tally's design: the grid is simplified, empty dispatch
 * cells are only shown for goods documents, and non-invoice types reuse the
 * same frame with only the fields that apply.
 */

import { formatMoney, formatQty, formatRate } from '../utils/format.js';
import { formatDate } from '../utils/dates.js';
import { amountInWords } from '../utils/numberToWords.js';
import { dec, div, isZero, toFixed, toPlain } from '../utils/decimal.js';
import { hsnSummary } from '../utils/hsn.js';
import { EXTRA_FIELDS } from '../config/documentTypes.js';
import { CancelledMark, QrBlock, stateLine } from './blocks.jsx';

/** Goods documents show the full Tally dispatch grid even when cells are empty. */
const GOODS_TYPES = new Set(['TAX_INVOICE', 'BILL_OF_SUPPLY', 'DELIVERY_CHALLAN', 'SALES_ORDER', 'PROFORMA_INVOICE']);
const MIN_ROWS = 6;

function Cell({ label, value, wide = false }) {
  return (
    <div className={`tp-cell ${wide ? 'tp-wide' : ''}`}>
      <div className="tp-cell-label">{label}</div>
      <div className="tp-cell-value">{value || ' '}</div>
    </div>
  );
}

function PartyBox({ title, name, company, address, gstin, state, phone, email, showTaxId, placeOfSupply }) {
  return (
    <div className="tp-box tp-party">
      <div className="tp-caption">{title}</div>
      <div className="tp-strong">{name || '—'}</div>
      {company && company !== name && <div>{company}</div>}
      {address && <div className="doc-pre">{address}</div>}
      {phone && <div>Ph: {phone}</div>}
      {email && <div>{email}</div>}
      {showTaxId && gstin && (
        <div>
          GSTIN/UIN <span className="tp-colon">:</span> <strong>{gstin}</strong>
        </div>
      )}
      {state && (
        <div>
          State Name <span className="tp-colon">:</span> {stateLine(state)}
        </div>
      )}
      {placeOfSupply && (
        <div>
          Place of Supply <span className="tp-colon">:</span> {stateLine(placeOfSupply)}
        </div>
      )}
    </div>
  );
}

export default function TallyProDocument({ payload, type, qr, compact = false, copy = '' }) {
  const { company = {}, document: doc, items = [], settings, parent } = payload;
  const ds = settings.doc;
  const meta = doc.meta || {};
  const fmtDate = (v) => (v ? formatDate(v, settings.dateFormat) : '');
  const plain = (v) => formatMoney(v, { ...doc, currency_symbol: '' });
  const money = (v) => formatMoney(v, doc);
  const showPrices = ds.showPrices !== false;
  const showTax = showPrices && ds.showTax !== false && doc.tax_mode !== 'NONE';
  const showHsn = ds.showHsn !== false;
  const showDiscount = showPrices && items.some((i) => !isZero(i.discount_amount));
  const showPackage = ds.showPackage && items.some((i) => i.package_info);
  const intra = doc.tax_mode === 'INTRA';
  const inter = doc.tax_mode === 'INTER';
  const half = (r) => toPlain(div(r, 2));
  const units = new Set(items.map((i) => i.unit));
  const totalQty = items.reduce((a, it) => a + dec(it.quantity), 0n);
  const hasBank = ['bank_name', 'account_number', 'ifsc', 'upi_id'].some((k) => company[k]);
  const title = ds.title || type.title;
  const receiverSign = ['DELIVERY_CHALLAN', 'GOODS_RECEIPT', 'JOB_COMPLETION'].includes(type.id);

  // Header grid (right-hand side).
  const cells = [
    [`${type.short === 'Invoice' ? 'Invoice' : type.short} No.`, doc.document_number || 'Auto'],
    ['Dated', fmtDate(doc.issue_date)],
  ];
  if (type.dueLabel) cells.push([type.dueLabel, fmtDate(doc.due_date)]);
  if (doc.reference || GOODS_TYPES.has(type.id)) cells.push(['Reference No.', doc.reference]);
  if (parent?.document_number) cells.push(['Created From', parent.document_number]);
  const extra = type.optional.filter((k) => k !== 'reverseCharge' && k !== 'termsOfDelivery');
  for (const k of extra) {
    const value = EXTRA_FIELDS[k]?.type === 'date' ? fmtDate(meta[k]) : meta[k];
    if (value || (GOODS_TYPES.has(type.id) && !compact)) cells.push([EXTRA_FIELDS[k]?.label || k, value]);
  }
  if (cells.length % 2) cells.push(['', '']);
  const showTermsOfDelivery = type.optional.includes('termsOfDelivery') && (meta.termsOfDelivery || (GOODS_TYPES.has(type.id) && !compact));
  if (doc.currency && settings.baseCurrency && doc.currency !== settings.baseCurrency) {
    cells.push(['Currency', `${doc.currency} (1 ${doc.currency} = ${doc.exchange_rate} ${settings.baseCurrency})`]);
    cells.push(['', '']);
  }

  const chargeRows = [];
  if (showPrices) {
    if (showTax && intra) {
      chargeRows.push(['CGST', doc.cgst]);
      chargeRows.push(['SGST', doc.sgst]);
    } else if (showTax && inter) {
      chargeRows.push(['IGST', doc.igst]);
    } else if (showTax && doc.tax_mode === 'SIMPLE') {
      chargeRows.push([doc.tax_label || 'Tax', doc.tax]);
    }
    if (!isZero(doc.shipping)) chargeRows.push(['Freight / Shipping', doc.shipping]);
    if (!isZero(doc.other_charges)) chargeRows.push([doc.other_charges_label || 'Other charges', doc.other_charges]);
    if (!isZero(doc.round_off)) chargeRows.push(['Round Off', doc.round_off]);
  }
  const hsnRows = showTax ? hsnSummary(items) : [];
  const fillers = Math.max(0, (compact ? 3 : MIN_ROWS) - items.length - chargeRows.length);
  const colCount = 3 + (showHsn ? 1 : 0) + (showPackage ? 1 : 0) + (showPrices ? 3 : 0) + (showDiscount ? 1 : 0);
  // Empty cells between description and amount keep Tally's vertical rules unbroken.
  const middle = Array.from({ length: colCount - 3 }, (_, i) => <td key={`m${i}`} />);

  return (
    <article className={`doc doc-tp ${compact ? 'doc-tp-compact' : ''}`} style={{ '--doc-accent': settings.documentAccent || '#1f4fd8' }}>
      <CancelledMark doc={doc} />
      <div className="tp-title-row">
        <span />
        <h1 className="tp-title">{title}</h1>
        <span className="tp-copy">{copy ? `(${copy})` : ''}</span>
      </div>

      <div className="tp-frame">
        {/* Top: seller + parties (left) / document particulars (right) */}
        <div className="tp-top">
          <div className="tp-left">
            <div className="tp-box tp-seller">
              {company.logo && <img className="tp-logo" src={company.logo} alt="" />}
              <div>
                <div className="tp-company">{company.name || 'Your Company'}</div>
                {company.legal_name && company.legal_name !== company.name && <div>{company.legal_name}</div>}
                <div className="doc-pre">
                  {[company.address, [company.city, company.pin].filter(Boolean).join(' - ')].filter((x) => x && x.trim()).join('\n')}
                </div>
                {company.gstin && (
                  <div>
                    GSTIN/UIN <span className="tp-colon">:</span> <strong>{company.gstin}</strong>
                  </div>
                )}
                {company.state && (
                  <div>
                    State Name <span className="tp-colon">:</span> {stateLine(company.state)}
                  </div>
                )}
                {(company.phone || company.email) && <div>{[company.phone && `Contact: ${company.phone}`, company.email && `E-Mail: ${company.email}`].filter(Boolean).join('  ')}</div>}
                {company.website && <div>{company.website}</div>}
              </div>
            </div>
            {doc.shipping_address?.trim() && (
              <PartyBox title="Consignee (Ship to)" name={doc.party_name} company={doc.party_company} address={doc.shipping_address} state={doc.party_state} showTaxId={false} />
            )}
            <PartyBox
              title={type.group === 'sales' || type.group === 'service' ? `Buyer (${type.partyLabel})` : type.partyLabel}
              name={doc.party_name}
              company={doc.party_company}
              address={doc.party_address}
              gstin={doc.party_gstin || doc.party_tax_id}
              state={doc.party_state}
              phone={doc.party_phone}
              email={doc.party_email}
              showTaxId={ds.showCustomerTaxId !== false}
              placeOfSupply={doc.place_of_supply && doc.place_of_supply !== doc.party_state ? doc.place_of_supply : ''}
            />
          </div>
          <div className="tp-right">
            <div className="tp-grid">
              {cells.map(([k, v], i) => (
                <Cell key={`${k}-${i}`} label={k} value={v} />
              ))}
              {showTermsOfDelivery && <Cell label="Terms of Delivery" value={meta.termsOfDelivery} wide />}
            </div>
            {!!qr.src && !qr.payment && (
              <div className="tp-qr">
                <QrBlock src={qr.src} caption={qr.caption} />
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        {type.layout === 'receipt' ? null : (
          <table className="tp-items">
            <thead>
              <tr>
                <th className="c-sn">Sl No.</th>
                <th className="c-desc">Description of {type.group === 'service' ? 'Services' : 'Goods'}</th>
                {showHsn && <th className="c-hsn">HSN/SAC</th>}
                <th className="c-num">Quantity</th>
                {showPackage && <th>Package</th>}
                {showPrices && <th className="c-num">Rate</th>}
                {showPrices && <th className="c-per">per</th>}
                {showDiscount && <th className="c-num">Disc.</th>}
                {showPrices && <th className="c-num c-amt">Amount</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it._key || it.id || i} className="tp-item">
                  <td className="c-sn">{i + 1}</td>
                  <td className="c-desc">
                    <strong>{it.name}</strong>
                    {it.description && <div className="tp-item-desc">{it.description}</div>}
                  </td>
                  {showHsn && <td className="c-hsn">{it.hsn_sac}</td>}
                  <td className="c-num">
                    <strong>
                      {formatQty(it.quantity)} {it.unit}
                    </strong>
                  </td>
                  {showPackage && <td>{it.package_info}</td>}
                  {showPrices && <td className="c-num">{plain(it.unit_price)}</td>}
                  {showPrices && <td className="c-per">{it.unit}</td>}
                  {showDiscount && (
                    <td className="c-num">
                      {isZero(it.discount_amount) ? '' : it.discount_type === 'PERCENT' ? `${formatRate(it.discount_value)} %` : plain(it.discount_amount)}
                    </td>
                  )}
                  {showPrices && (
                    <td className="c-num c-amt">
                      <strong>{plain(it.taxable_amount)}</strong>
                    </td>
                  )}
                </tr>
              ))}
              {showPrices && !isZero(doc.discount) && !showDiscount && (
                <tr className="tp-charge">
                  <td />
                  <td className="c-desc tp-charge-label">Less: Discount</td>
                  {middle}
                  <td className="c-num c-amt">(-) {plain(doc.discount)}</td>
                </tr>
              )}
              {showPrices && chargeRows.length > 0 && items.length > 1 && (
                <tr className="tp-subtotal">
                  <td />
                  <td className="c-desc" />
                  {middle}
                  <td className="c-num c-amt tp-rule">{plain(doc.subtotal)}</td>
                </tr>
              )}
              {chargeRows.map(([label, value]) => (
                <tr key={label} className="tp-charge">
                  <td />
                  <td className="c-desc tp-charge-label">{label}</td>
                  {middle}
                  <td className="c-num c-amt">
                    <strong>{plain(value)}</strong>
                  </td>
                </tr>
              ))}
              {Array.from({ length: fillers }, (_, i) => (
                <tr key={`f${i}`} className="tp-filler">
                  {Array.from({ length: colCount }, (__, j) => (
                    <td key={j} />
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td />
                <td className="c-desc tp-total-label">Total</td>
                {showHsn && <td />}
                <td className="c-num">
                  <strong>{units.size === 1 ? `${formatQty(totalQty)} ${[...units][0]}` : formatQty(totalQty)}</strong>
                </td>
                {showPackage && <td />}
                {showPrices && <td />}
                {showPrices && <td />}
                {showDiscount && <td />}
                {showPrices && (
                  <td className="c-num c-amt tp-grand" data-testid="tp-grand-total">
                    {money(doc.grand_total)}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        )}

        {type.layout === 'receipt' && (
          <div className="tp-box tp-receipt">
            <p>
              {type.partyKind === 'vendor' ? 'Paid to' : 'Received with thanks from'} <strong>{doc.party_name || '—'}</strong> the sum of <strong>{money(doc.grand_total)}</strong>
              {meta.payment_mode ? ` by ${meta.payment_mode}` : ''}
              {meta.payment_reference ? ` (Ref: ${meta.payment_reference})` : ''}
              {meta.against ? ` against ${meta.against}` : ''} on {fmtDate(doc.issue_date)}.
            </p>
          </div>
        )}

        {/* Amount in words */}
        {showPrices && (
          <div className="tp-box tp-words">
            <div className="tp-row-between">
              <span>Amount Chargeable (in words)</span>
              <span className="tp-eoe">E. &amp; O.E</span>
            </div>
            <div className="tp-strong">
              {doc.currency} {amountInWords(doc.grand_total, doc.currency, Number(doc.currency_decimals ?? 2))}
            </div>
          </div>
        )}

        {/* HSN/SAC summary */}
        {hsnRows.length > 0 && ds.showTaxBreakup !== false && (
          <table className="tp-hsn">
            <thead>
              <tr>
                <th rowSpan={2} className="c-desc">
                  HSN/SAC
                </th>
                <th rowSpan={2} className="c-num">
                  Taxable Value
                </th>
                {intra && <th colSpan={2}>Central Tax</th>}
                {intra && <th colSpan={2}>State/UT Tax</th>}
                {inter && <th colSpan={2}>Integrated Tax</th>}
                {!intra && !inter && <th colSpan={2}>{doc.tax_label || 'Tax'}</th>}
                <th rowSpan={2} className="c-num">
                  Total Tax Amount
                </th>
              </tr>
              <tr>
                {(intra ? [0, 1] : [0]).map((i) => [
                  <th key={`r${i}`} className="c-rate">
                    Rate
                  </th>,
                  <th key={`a${i}`} className="c-num">
                    Amount
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {hsnRows.map((r) => (
                <tr key={`${r.hsn}|${r.rate}`}>
                  <td className="c-desc">{r.hsn || '—'}</td>
                  <td className="c-num">{plain(toFixed(r.taxable))}</td>
                  {intra && <td className="c-rate">{half(r.rate)}%</td>}
                  {intra && <td className="c-num">{plain(toFixed(r.cgst))}</td>}
                  {intra && <td className="c-rate">{half(r.rate)}%</td>}
                  {intra && <td className="c-num">{plain(toFixed(r.sgst))}</td>}
                  {inter && <td className="c-rate">{formatRate(r.rate)}%</td>}
                  {inter && <td className="c-num">{plain(toFixed(r.igst))}</td>}
                  {!intra && !inter && <td className="c-rate">{formatRate(r.rate)}%</td>}
                  {!intra && !inter && <td className="c-num">{plain(toFixed(r.tax))}</td>}
                  <td className="c-num">{plain(toFixed(r.tax))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="c-desc">
                  <strong>Total</strong>
                </td>
                <td className="c-num">
                  <strong>{plain(toFixed(hsnRows.reduce((a, r) => a + r.taxable, 0n)))}</strong>
                </td>
                {intra && <td />}
                {intra && (
                  <td className="c-num">
                    <strong>{plain(doc.cgst)}</strong>
                  </td>
                )}
                {intra && <td />}
                {intra && (
                  <td className="c-num">
                    <strong>{plain(doc.sgst)}</strong>
                  </td>
                )}
                {inter && <td />}
                {inter && (
                  <td className="c-num">
                    <strong>{plain(doc.igst)}</strong>
                  </td>
                )}
                {!intra && !inter && <td />}
                {!intra && !inter && (
                  <td className="c-num">
                    <strong>{plain(doc.tax)}</strong>
                  </td>
                )}
                <td className="c-num">
                  <strong>{plain(doc.tax)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
        {showTax && !isZero(doc.tax) && (
          <div className="tp-box tp-words">
            Tax Amount (in words) <span className="tp-colon">:</span>{' '}
            <strong>
              {doc.currency} {amountInWords(doc.tax, doc.currency, Number(doc.currency_decimals ?? 2))}
            </strong>
          </div>
        )}
        {type.optional.includes('reverseCharge') && (
          <div className="tp-box tp-small">
            Whether tax is payable on reverse charge <span className="tp-colon">:</span> <strong>{meta.reverseCharge === 'Yes' ? 'Yes' : 'No'}</strong>
          </div>
        )}

        {(doc.notes?.trim() || doc.terms?.trim()) && (
          <div className="tp-box tp-notes">
            {doc.notes?.trim() && (
              <div>
                <span className="tp-caption">Remarks:</span>
                <div className="doc-pre">{doc.notes}</div>
              </div>
            )}
            {doc.terms?.trim() && (
              <div>
                <span className="tp-caption">Terms &amp; Conditions:</span>
                <div className="doc-pre">{doc.terms}</div>
              </div>
            )}
          </div>
        )}

        {/* Bottom: PAN + declaration (left) / bank + signature (right) */}
        <div className="tp-bottom">
          <div className="tp-bottom-left">
            {company.pan && (
              <div>
                Company&apos;s PAN <span className="tp-colon">:</span> <strong>{company.pan}</strong>
              </div>
            )}
            {ds.showDeclaration !== false && settings.declaration?.trim() && (
              <div className="tp-declaration">
                <div className="tp-underline">Declaration</div>
                <div className="doc-pre">{settings.declaration}</div>
              </div>
            )}
            {receiverSign && (
              <div className="tp-receiver">
                <div className="tp-sign-space" />
                <div>Receiver&apos;s Signature</div>
              </div>
            )}
          </div>
          <div className="tp-bottom-right">
            {((ds.showBank !== false && showPrices && hasBank) || (qr.payment && qr.src)) && (
              <div className="tp-pay">
                {ds.showBank !== false && showPrices && hasBank && (
                  <div className="tp-bank">
                    <div className="tp-caption">Company&apos;s Bank Details</div>
                    {company.account_holder && (
                      <div>
                        A/c Holder&apos;s Name <span className="tp-colon">:</span> <strong>{company.account_holder}</strong>
                      </div>
                    )}
                    {company.bank_name && (
                      <div>
                        Bank Name <span className="tp-colon">:</span> <strong>{company.bank_name}</strong>
                      </div>
                    )}
                    {company.account_number && (
                      <div>
                        A/c No. <span className="tp-colon">:</span> <strong>{company.account_number}</strong>
                      </div>
                    )}
                    {(company.branch || company.ifsc) && (
                      <div>
                        Branch &amp; IFS Code <span className="tp-colon">:</span> <strong>{[company.branch, company.ifsc].filter(Boolean).join(' & ')}</strong>
                      </div>
                    )}
                    {company.upi_id && (
                      <div>
                        UPI <span className="tp-colon">:</span> <strong>{company.upi_id}</strong>
                      </div>
                    )}
                  </div>
                )}
                {qr.payment && !!qr.src && (
                  <div className="tp-pay-qr" data-testid="upi-qr">
                    <QrBlock src={qr.src} caption={qr.caption} />
                  </div>
                )}
              </div>
            )}
            {ds.showSignature !== false && (
              <div className="tp-sign">
                <div className="tp-sign-for">for {company.name || 'Your Company'}</div>
                <div className="tp-sign-space">
                  {ds.showStamp !== false && company.stamp && <img className="doc-stamp" src={company.stamp} alt="" />}
                  {company.signature && <img className="doc-signature" src={company.signature} alt="" />}
                </div>
                <div>Authorised Signatory</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="tp-footer">
        {settings.jurisdiction && <div className="tp-strong">SUBJECT TO {settings.jurisdiction.toUpperCase()} JURISDICTION</div>}
        <div>{settings.footerText || `This is a Computer Generated ${type.short === 'Invoice' ? 'Invoice' : 'Document'}`}</div>
      </footer>
    </article>
  );
}
