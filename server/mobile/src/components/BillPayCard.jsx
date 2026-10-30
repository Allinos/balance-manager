/**
 * Payment card at the bottom of a bill on the phone (Payment & Ledger on), just above Save:
 * Full (default) · Partial (payments of amount + mode, + Add payment) · Credit, with Total / Paid / Due.
 */

import { PAYMENT_MODES } from '@desktop/config/documentTypes.js';
import { PAYMENT_KINDS, partialRows, paymentError, paymentKind, paymentSummary } from '@desktop/services/billPayment.js';
import { formatMoney } from '@desktop/utils/format.js';
import Icon from './Icon.jsx';
import { NumberInput, Segmented, Select } from './ui.jsx';

export default function BillPayCard({ doc, grandTotal, onChange }) {
  const kind = paymentKind(doc);
  const rows = partialRows(doc.meta);
  const sum = paymentSummary(doc, grandTotal, Number(doc.currency_decimals ?? 2));
  const error = paymentError(doc, grandTotal);
  const setRows = (next) => onChange({ payment: 'partial', payments: next });
  const setRow = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // Whole amounts on the phone: ₹10,030 reads faster than ₹10,030.00.
  const short = (v) => formatMoney(v, { ...doc, currency_decimals: Number(v) % 1 ? doc.currency_decimals : 0 });

  return (
    <section className="card form bill-pay" data-testid="bill-payment">
      <strong>Payment</strong>
      <Segmented
        value={kind}
        onChange={(v) => onChange(v === 'partial' ? { payment: v, payments: rows } : { payment: v })}
        options={PAYMENT_KINDS.map((k) => ({ value: k.value, label: k.short }))}
        testId="bill-payment-kind"
      />
      {kind === 'full' && (
        <div className="bill-pay-row">
          <span className="small muted">{doc.document_type === 'PURCHASE_INVOICE' ? 'Paid by' : 'Received by'}</span>
          <Select value={doc.meta.payment_mode || 'Cash'} onChange={(v) => onChange({ payment_mode: v })} options={PAYMENT_MODES} data-testid="bill-payment-mode" />
        </div>
      )}
      {kind === 'partial' && (
        <>
          {rows.map((r, i) => (
            <div className="bill-pay-row" key={i} data-testid="bill-payment-row">
              <NumberInput className="input" placeholder="Amount" inputMode="decimal" value={r.amount} onChange={(v) => setRow(i, { amount: v })} data-testid={`bill-payment-amount-${i}`} />
              <Select value={r.mode || 'Cash'} onChange={(v) => setRow(i, { mode: v })} options={PAYMENT_MODES} data-testid={`bill-payment-row-mode-${i}`} />
              {rows.length > 1 && (
                <button type="button" className="icon-btn sm" aria-label="Remove payment" onClick={() => setRows(rows.filter((_, j) => j !== i))} data-testid={`bill-payment-remove-${i}`}>
                  <Icon name="x" size={16} />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="link-btn" onClick={() => setRows([...rows, { amount: '', mode: 'Cash' }])} data-testid="bill-payment-add">
            + Add payment
          </button>
        </>
      )}
      <div className="bill-pay-sum" data-testid="bill-payment-sum">
        <div>
          <span>Total</span>
          <strong>{short(grandTotal)}</strong>
        </div>
        <div>
          <span>Paid</span>
          <strong className="get" data-testid="bill-paid">{short(sum.paid)}</strong>
        </div>
        <div>
          <span>Due</span>
          <strong className={Number(sum.due) > 0 ? 'give' : ''} data-testid="bill-due">{short(sum.due)}</strong>
        </div>
      </div>
      {error && <p className="small bad-text" data-testid="bill-payment-error">{error}</p>}
    </section>
  );
}
