/**
 * HTML document renderer (A4). One renderer for every document type; the
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
import { copyLabel } from './copies.js';
import {
  AmountInWords,
  BankDetails,
  CancelledMark,
  Declaration,
  DocumentFooter,
  DocumentHeader,
  DocumentMeta,
  ItemsTable,
  PartyBlock,
  QrBlock,
  ReceiptBody,
  ShippingBlock,
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

/**
 * @param {{payload: Object}} props
 */
/**
 * @param {{payload: Object, copyIndex?: number, copies?: number}} props
 *   copyIndex / copies: which copy this is when several are printed (labels such as "DUPLICATE FOR TRANSPORTER").
 */
export default function DocumentRenderer({ payload, copyIndex = 0, copies = 1 }) {
  const { company = {}, document: doc, items = [], taxes = [], settings, parent } = payload;
  const ds = settings.doc;
  const type = getType(doc.document_type);
  // Template: this document's choice → the type's → the global default.
  const template = normaliseTemplate(doc.template || ds.template || settings.documentStyle);
  const showPrices = ds.showPrices !== false;
  const showTax = ds.showTax !== false && doc.tax_mode !== 'NONE';
  const isReceipt = type.layout === 'receipt';
  const receiverSignature = ['DELIVERY_CHALLAN', 'GOODS_RECEIPT', 'JOB_COMPLETION'].includes(type.id);

  const qr = useMemo(
    () => (ds.showQr ? qrFor(payload) : { src: '', caption: '' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ds.showQr, settings.qrContent, settings.qrCustomText, company.upi_id, doc.grand_total, doc.document_number, doc.issue_date],
  );
  const hasBank = ['bank_name', 'account_number', 'ifsc', 'iban', 'upi_id'].some((k) => company[k]);
  const bank = ds.showBank !== false && showPrices && hasBank;

  const copy = copyLabel(type, copyIndex, copies);
  if (template === 'tally-pro' && !isReceipt) return <TallyProDocument payload={payload} type={type} qr={qr} copy={copy} />;

  return (
    <article className={`doc doc-${template}`} style={{ '--doc-accent': settings.documentAccent || '#1f4fd8' }}>
      <CancelledMark doc={doc} />
      {copy && <div className="doc-copy-label">{copy}</div>}
      <DocumentHeader company={company} title={ds.title || type.title} doc={doc} />

      <section className="doc-parties">
        <PartyBlock doc={doc} label={type.partyLabel} showTaxId={ds.showCustomerTaxId !== false} />
        <ShippingBlock doc={doc} />
        <DocumentMeta
          doc={doc}
          type={type}
          dateFormat={settings.dateFormat}
          parent={parent}
          baseCurrency={settings.baseCurrency}
        />
      </section>

      {isReceipt ? (
        <ReceiptBody doc={doc} dateFormat={settings.dateFormat} />
      ) : (
        <>
          <ItemsTable items={items} doc={doc} ds={ds} />
          {showPrices && (
            <section className="doc-summary">
              <div className="doc-summary-left">
                {ds.showAmountInWords !== false && <AmountInWords doc={doc} />}
              </div>
              <TotalsSummary doc={doc} ds={ds} />
            </section>
          )}
          {showPrices && showTax && ds.showTaxBreakup !== false && <TaxSummary taxes={taxes} doc={doc} />}
        </>
      )}

      {(bank || qr.src) && (
        <section className="doc-payment">
          {bank ? <BankDetails company={company} /> : <div />}
          <QrBlock src={qr.src} caption={qr.caption} />
        </section>
      )}

      <TermsAndConditions notes={doc.notes} terms={doc.terms} />
      {ds.showDeclaration !== false && <Declaration text={settings.declaration} />}
      <SignatureBlock company={company} ds={ds} receiverSignature={receiverSignature} />
      <DocumentFooter text={settings.footerText} jurisdiction={settings.jurisdiction} />
    </article>
  );
}
