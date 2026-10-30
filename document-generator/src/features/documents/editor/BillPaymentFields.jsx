/**
 * Payment section at the bottom of a bill (Payment & Ledger on): Paid in full (default), Partial with one or more
 * payments (amount + mode), or Credit. Shows what is paid and what is still due as you type.
 */

import Icon from '../../../components/Icon.jsx';
import { NumberInput, Segmented, Select } from '../../../components/Form.jsx';
import { PAYMENT_MODES } from '../../../config/documentTypes.js';
import { PAYMENT_KINDS, partialRows, paymentError, paymentKind, paymentSummary } from '../../../services/billPayment.js';
import { formatMoney } from '../../../utils/format.js';

export default function BillPaymentFields({ doc, grandTotal, onChange }) {
  const kind = paymentKind(doc);
  const rows = partialRows(doc.meta);
  const sum = paymentSummary(doc, grandTotal, Number(doc.currency_decimals ?? 2));
  const error = paymentError(doc, grandTotal);
  const setRows = (next) => onChange({ payment: 'partial', payments: next });
  const setRow = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const vendor = doc.document_type === 'PURCHASE_INVOICE';

  return (
    <section className="card editor-section bill-payment" data-testid="bill-payment">
      <div className="bill-payment-head">
        <h2>Payment</h2>
        <Segmented
          value={kind}
          onChange={(v) => onChange(v === 'partial' ? { payment: v, payments: rows } : { payment: v })}
          options={PAYMENT_KINDS.map((k) => ({ value: k.value, label: k.label }))}
          testId="bill-payment-kind"
        />
      </div>
      {kind === 'full' && (
        <div className="bill-payment-row">
          <span className="muted">{vendor ? 'Paid by' : 'Received by'}</span>
          <Select value={doc.meta.payment_mode || 'Cash'} onChange={(v) => onChange({ payment_mode: v })} options={PAYMENT_MODES} data-testid="bill-payment-mode" />
        </div>
      )}
      {kind === 'partial' && (
        <>
          {rows.map((r, i) => (
            <div className="bill-payment-row" key={i} data-testid="bill-payment-row">
              <NumberInput placeholder="Amount" value={r.amount} onChange={(v) => setRow(i, { amount: v })} data-testid={`bill-payment-amount-${i}`} />
              <Select value={r.mode || 'Cash'} onChange={(v) => setRow(i, { mode: v })} options={PAYMENT_MODES} data-testid={`bill-payment-row-mode-${i}`} />
              {rows.length > 1 && (
                <button type="button" className="icon-btn" title="Remove payment" onClick={() => setRows(rows.filter((_, j) => j !== i))} data-testid={`bill-payment-remove-${i}`}>
                  <Icon name="x" size={16} />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={() => setRows([...rows, { amount: '', mode: 'Cash' }])} data-testid="bill-payment-add">
            <Icon name="plus" size={15} /> Add payment
          </button>
        </>
      )}
      <div className="bill-payment-sum" data-testid="bill-payment-sum">
        <div>
          <span>Bill total</span>
          <strong>{formatMoney(grandTotal, doc)}</strong>
        </div>
        <div>
          <span>Paid</span>
          <strong className="get" data-testid="bill-paid">{formatMoney(sum.paid, doc)}</strong>
        </div>
        <div>
          <span>Remaining due</span>
          <strong className={Number(sum.due) > 0 ? 'give' : ''} data-testid="bill-due">{formatMoney(sum.due, doc)}</strong>
        </div>
      </div>
      {error && <p className="text-danger small" data-testid="bill-payment-error">{error}</p>}
    </section>
  );
}
