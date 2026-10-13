/**
 * HTML document renderer (A4; receipts and vouchers also A5). One renderer for every document type; the
 * document type definition and resolved settings decide what is shown.
 *
 * Payload shape:
 *   { company, document, items, taxes, settings: { ...global, doc: resolvedTypeSettings }, parent }
 */

import { useMemo } from 'react';
import { getType, normaliseTemplate } from '../config/documentTypes.js';
import { qrDataUrl, upiLink } from '../utils/qr.js';
import { formatMoney } from '../utils/format.js';
import { formatDate } from '../utils/dates.js';
import TallyProDocument from './TallyProDocument.jsx';
import ReceiptDocument from './ReceiptDocument.jsx';
import { a5Class, sheetClass } from './paging.js';
import { copyLabel } from './copies.js';
import {
  AmountInWords,
  BankDetails,
  CancelledMark,
  ContinuationHead,
  ContinuedNote,
  Declaration,
  DocumentFooter,
  DocumentHeader,
  DocumentMeta,
  ItemsTable,
  PageFooter,
  PartyBlock,
  QrBlock,
  ShippingBlock,
  DeliveryAcknowledgement,
  SignatureBlock,
  TaxSummary,
  TermsAndConditions,
  TotalsSummary,
} from './blocks.jsx';
import './document.css';

function qrFor(payload) {
  const { company, document: doc, settings } = payload;
  const title = settings.doc.title;
  switch (settings.qrContent) {
    case 'UPI':
      if (!company.upi_id) return { src: '', caption: '' };
      return {
        src: qrDataUrl(
          upiLink({
            upiId: company.upi_id,
            payee: company.name,
            amount: doc.currency === 'INR' ? doc.grand_total : '',
            note: doc.document_number,
          }),
        ),
        caption: 'Scan to pay (UPI)',
        payment: true,
      };
    case 'CONTACT':
      return {
        src: qrDataUrl([company.name, company.phone, company.email, company.website].filter(Boolean).join('\n')),
        caption: 'Contact us',
      };
    case 'CUSTOM':
      return { src: qrDataUrl(settings.qrCustomText || ''), caption: '' };
    default:
      return {
        src: qrDataUrl(
          `${title} ${doc.document_number}\nDate: ${formatDate(doc.issue_date, settings.dateFormat)}\nAmount: ${formatMoney(doc.grand_total, doc)}\n${company.name || ''}`,
        ),
        caption: '',
      };
  }
}

/** The template a payload is drawn in: this document's choice → the type's → the global default. */
export const templateOf = (payload) =>
  normaliseTemplate(payload.document.template || payload.settings.doc.template || payload.settings.documentStyle);

/** Templates drawn as full A4 pages (see paging.js). Standard and Simple flow as one sheet. */
export const PAGED_TEMPLATES = ['tally-pro', 'modern'];

/**
 * @param {{payload: Object, copyIndex?: number, copies?: number, paging?: Object}} props
 *   copyIndex / copies: which copy this is when several are printed (labels such as "DUPLICATE FOR TRANSPORTER").
 *   paging: { mode: 'measure' } to draw one long sheet for measuring, or { mode: 'page', pageNo, pageCount,
 *   from, to, first, last, fill, overflow, colWidths } to draw one A4 page (Professional and Modern only).
 */
export default function DocumentRenderer({ payload, copyIndex = 0, copies = 1, paging }) {
  const { company = {}, document: doc, items = [], taxes = [], settings, parent } = payload;
  const ds = settings.doc;
  const type = getType(doc.document_type);
  const template = templateOf(payload);
  const showPrices = ds.showPrices !== false;
  const showTax = ds.showTax !== false && doc.tax_mode !== 'NONE';
  const isReceipt = type.layout === 'receipt';
  const receiverSignature = ['DELIVERY_CHALLAN', 'GOODS_RECEIPT', 'JOB_COMPLETION', 'PROOF_OF_DELIVERY'].includes(type.id);
  const pod = type.id === 'PROOF_OF_DELIVERY';
  const receiverLabel = pod ? "Receiver's Signature & Stamp" : "Receiver's Signature";

  const qr = useMemo(
    () => (ds.showQr ? qrFor(payload) : { src: '', caption: '' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ds.showQr, settings.qrContent, settings.qrCustomText, company.upi_id, doc.grand_total, doc.document_number, doc.issue_date],
  );
  const hasBank = ['bank_name', 'account_number', 'ifsc', 'iban', 'upi_id'].some((k) => company[k]);
  const bank = ds.showBank !== false && showPrices && hasBank;

  const taxBreakup = showPrices && showTax && ds.showTaxBreakup !== false;
  const modern = template === 'modern';
  const copy = copyLabel(type, copyIndex, copies);
  if (isReceipt) return <ReceiptDocument payload={payload} template={template} copy={copy} paging={paging} />;
  if (template === 'tally-pro') return <TallyProDocument payload={payload} type={type} qr={qr} copy={copy} paging={paging} />;

  // One A4 page of a paged bill: page 1 has the header, the last page the totals and signature.
  const page = paging?.mode === 'page' && modern ? paging : null;
  const head = !page || page.first;
  const tail = !page || page.last;
  const title = ds.title || type.title;

  return (
    <article
      className={`doc doc-${template}${sheetClass(page)}${a5Class(ds, paging)}`}
      style={{ '--doc-accent': settings.documentAccent || '#1f4fd8' }}
    >
      <CancelledMark doc={doc} />
      {head ? (
        <>
          {copy && <div className="doc-copy-label">{copy}</div>}
          <DocumentHeader company={company} title={title} doc={doc} />

          <section className="doc-parties">
            <div className="doc-party-col">
              {/* Ship To above Bill To (as printed by Tally): where the goods go, then who is billed. */}
              <ShippingBlock doc={doc} showTaxId={ds.showCustomerTaxId !== false} />
              <PartyBlock doc={doc} label={type.partyLabel} showTaxId={ds.showCustomerTaxId !== false} />
            </div>
            <DocumentMeta
              doc={doc}
              type={type}
              dateFormat={settings.dateFormat}
              parent={parent}
              baseCurrency={settings.baseCurrency}
            />
          </section>
        </>
      ) : (
        <ContinuationHead company={company} title={title} doc={doc} />
      )}

      <ItemsTable
        items={page ? items.slice(page.from, page.to) : items}
        doc={doc}
        ds={ds}
        start={page ? page.from : 0}
        colWidths={page?.colWidths}
        hideFoot={!tail}
        noEmptyRow={!!page && items.length > 0}
        fill={page ? page.fill : 0}
      />
      {!tail && <ContinuedNote next={page.pageNo + 1} />}
      {tail && showPrices && (
        <section className="doc-summary">
          <div className="doc-summary-left">
            {ds.showAmountInWords !== false && <AmountInWords doc={doc} />}
            {modern && taxBreakup && <TaxSummary taxes={taxes} doc={doc} />}
          </div>
          <TotalsSummary doc={doc} ds={ds} />
        </section>
      )}
      {!modern && taxBreakup && <TaxSummary taxes={taxes} doc={doc} />}

      {!tail ? null : modern ? (
        <>
          {/* Modern: notes and terms side by side, then bank · QR · signature in one row, so a normal bill fits one A4 page. */}
          <TermsAndConditions notes={doc.notes} terms={doc.terms} />
          {ds.showDeclaration !== false && <Declaration text={ds.declaration} />}
          {pod && <DeliveryAcknowledgement doc={doc} dateFormat={settings.dateFormat} />}
          <section className="doc-closing">
            <div className="doc-closing-pay">
              {bank && <BankDetails company={company} />}
              <QrBlock src={qr.src} caption={qr.caption} />
            </div>
            <SignatureBlock company={company} ds={ds} receiverSignature={receiverSignature} receiverLabel={receiverLabel} />
          </section>
        </>
      ) : (
        <>
          {(bank || qr.src) && (
            <section className="doc-payment">
              {bank ? <BankDetails company={company} /> : <div />}
              <QrBlock src={qr.src} caption={qr.caption} />
            </section>
          )}

          <TermsAndConditions notes={doc.notes} terms={doc.terms} />
          {ds.showDeclaration !== false && <Declaration text={ds.declaration} />}
          {pod && <DeliveryAcknowledgement doc={doc} dateFormat={settings.dateFormat} />}
          <SignatureBlock company={company} ds={ds} receiverSignature={receiverSignature} receiverLabel={receiverLabel} />
        </>
      )}
      {tail && <DocumentFooter text={settings.footerText} jurisdiction={settings.jurisdiction} />}
      {page && page.pageCount > 1 && (
        <PageFooter label={`${title} ${doc.document_number || ''}`} pageNo={page.pageNo} pageCount={page.pageCount} />
      )}
    </article>
  );
}
