/**
 * A customer's / vendor's profile: I'll get / I'll give, the bills still unpaid, and the ledger with a running
 * balance (Payment & Ledger on). "Payment received" (customer) / "Payment made" (vendor) asks only for the amount
 * and the mode; it is saved as a receipt / payment voucher that clears the oldest unpaid bills first.
 */

import { useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import { EmptyState, PageHeader, Spinner } from '../../components/Common.jsx';
import { Field, NumberInput, Select } from '../../components/Form.jsx';
import { PAYMENT_MODES } from '../../config/documentTypes.js';
import { ledgerOn } from '../../services/billPayment.js';
import { allocate, balanceLabel, partyLedger, PAYMENT_SIDES, recordPayment, sidesOf } from '../../services/ledgerService.js';
import { formatDate, todayISO } from '../../utils/dates.js';
import { abs, dec } from '../../utils/decimal.js';
import { useAppData, useDocContext } from '../../hooks/useAppData.jsx';
import { useMoney } from '../../hooks/useMoney.js';
import PrivacyToggle from '../../components/PrivacyToggle.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import { Link, useRouter } from '../../router/router.jsx';
import { PartyForm } from './PartiesPage.jsx';

const KIND_LABEL = { customer: 'Customer', vendor: 'Vendor', both: 'Customer & vendor' };
const STATE_LABEL = { unpaid: 'Unpaid', partial: 'Partly paid' };

/** Payment received / Payment made: amount and mode only, with what it will settle. */
function PaymentDialog({ party, side, ledger, onClose, onSaved }) {
  const ctx = useDocContext();
  const toast = useToast();
  const money = useMoney();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [saving, setSaving] = useState(false);
  const labels = PAYMENT_SIDES[side];
  const plan = allocate(ledger, side, amount);
  const after = dec(plan.balanceAfter);

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const saved = await recordPayment({ party, side, amount, mode, ledger, ctx });
      toast.success(`${labels.button}: ${money(amount)} saved as ${saved.document_number}`);
      onSaved();
    } catch (err) {
      toast.error(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal title={labels.button} onClose={onClose} size="sm">
      <form onSubmit={save} className="form pay-dialog" data-testid="pay-dialog">
        <p className="muted small">{side === 'vendor' ? `to ${party.name}` : `from ${party.name}`}</p>
        <Field label={labels.amount} required>
          <NumberInput placeholder="0.00" value={amount} onChange={setAmount} autoFocus data-testid="pay-amount" />
        </Field>
        <Field label="Payment mode">
          <Select value={mode} onChange={setMode} options={PAYMENT_MODES} data-testid="pay-mode" />
        </Field>
        {dec(amount || '0') > 0n && (
          <div className="pay-plan" data-testid="pay-settles">
            {plan.settles.length > 0 && <strong>This will settle</strong>}
            {plan.settles.map((s, i) => (
              <div key={s.id}>
                <span>
                  {s.number || 'Bill'}
                  {i === 0 && plan.settles.length > 1 ? ' (oldest first)' : ''}
                  {!s.clears && <span className="muted"> · part</span>}
                </span>
                <span>{money(s.amount)}</span>
              </div>
            ))}
            {dec(plan.left) > 0n && (
              <div>
                <span>Not against a bill</span>
                <span>{money(plan.left)}</span>
              </div>
            )}
            <div className="pay-plan-total">
              <span>Balance after</span>
              <strong className={after > 0n ? 'get' : after < 0n ? 'give' : 'settled'}>
                {after === 0n ? `${money('0')} · settled` : `${money(abs(after))} · ${balanceLabel(after)}`}
              </strong>
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || dec(amount || '0') <= 0n} data-testid="pay-save">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function PartyLedgerPage({ params }) {
  const { settings } = useAppData();
  const { navigate } = useRouter();
  const toast = useToast();
  const money = useMoney();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState('');
  const withLedger = ledgerOn(settings);

  const load = useCallback(async () => {
    try {
      setData(await partyLedger(params.id));
    } catch (e) {
      setError(e.message);
    }
  }, [params.id]);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="page"><div className="callout callout-error">{error}</div></div>;
  if (!data) return <Spinner />;
  const { party, ledger } = data;
  const today = todayISO();
  const balance = dec(ledger.balance);

  return (
    <div className="page" data-testid="party-ledger">
      <PageHeader
        back={
          <Link to="/parties/all" className="icon-btn" aria-label="Back to Customers & Vendors">
            <Icon name="back" />
          </Link>
        }
        title={party.name}
        subtitle={[KIND_LABEL[party.kind] || 'Customer', party.phone, party.gstin || party.tax_id, party.state].filter(Boolean).join(' · ')}
        actions={
          <div className="row-actions">
            {withLedger && <PrivacyToggle className="btn" size={16} />}
            <button className="btn" onClick={() => setEditing(true)} data-testid="party-profile-edit">
              <Icon name="edit" size={16} /> Edit
            </button>
            {withLedger &&
              sidesOf(party).map((side) => (
                <button key={side} className="btn btn-primary" onClick={() => setPaying(side)} data-testid={`party-pay-${side}`}>
                  <Icon name="wallet" size={16} /> {PAYMENT_SIDES[side].button}
                </button>
              ))}
          </div>
        }
      />

      {!withLedger ? (
        <div className="card card-pad muted" data-testid="ledger-off">
          Switch on <strong>Payment &amp; Ledger</strong> in <Link to="/settings/parties">Settings → Features</Link> to take payments on bills and see what{' '}
          {party.name} owes you or you owe them.
        </div>
      ) : (
        <>
          <div className="card card-pad party-balance-card" data-testid="party-balance">
            <div>
              <small className="muted">{balanceLabel(ledger.balance)}</small>
              <strong className={balance > 0n ? 'get' : balance < 0n ? 'give' : ''} data-testid="party-balance-amount">
                {money(abs(ledger.balance))}
              </strong>
            </div>
            <span className="muted">
              {ledger.open.length === 0 ? 'No unpaid bills' : `${ledger.open.length} bill${ledger.open.length > 1 ? 's' : ''} unpaid`}
            </span>
          </div>

          <section className="card table-card">
            <div className="card-header">
              <h2>Ledger</h2>
              <span className="muted small">Every bill and payment, oldest first, with the running balance</span>
            </div>
            {ledger.rows.length === 0 ? (
              <EmptyState icon="book" title="No transactions yet" message="Invoices, bills and payments of this party appear here automatically." />
            ) : (
              <table className="table ledger-table" data-testid="ledger-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Entry</th>
                    <th>Mode</th>
                    <th className="num">You gave</th>
                    <th className="num">You got</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.rows.map((r) => (
                    <tr key={r.key} onClick={() => navigate(`/doc/${r.id}`)} className="clickable" data-testid="ledger-row">
                      <td>{formatDate(r.date, settings.dateFormat)}</td>
                      <td>
                        <strong>{r.label}</strong> {r.number}
                        {r.against && <span className="muted small"> · {r.onBill ? 'on' : 'against'} {r.against}</span>}
                      </td>
                      <td>{r.mode}</td>
                      <td className="num give">{r.gave ? money(r.gave) : ''}</td>
                      <td className="num get">{r.got ? money(r.got) : ''}</td>
                      <td className="num">
                        {money(abs(r.balance))} <span className="muted small">{dec(r.balance) > 0n ? 'get' : dec(r.balance) < 0n ? 'give' : ''}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card table-card">
            <div className="card-header">
              <h2>Unpaid bills</h2>
              <span className="muted small">Payments clear the oldest bill first</span>
            </div>
            {ledger.open.length === 0 ? (
              <p className="muted card-pad" data-testid="open-bills-empty">
                Nothing outstanding.
              </p>
            ) : (
              <table className="table" data-testid="open-bills">
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Date</th>
                    <th>Due date</th>
                    <th className="num">Total</th>
                    <th className="num">Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.open.map((b) => {
                    const overdue = b.due_date && b.due_date < today;
                    return (
                      <tr key={b.id} onClick={() => navigate(`/doc/${b.id}`)} className="clickable" data-testid="open-bill">
                        <td>
                          <strong>{b.number}</strong> <span className="muted small">{b.label}</span>
                        </td>
                        <td>{formatDate(b.date, settings.dateFormat)}</td>
                        <td className={overdue ? 'text-danger' : ''}>{b.due_date ? formatDate(b.due_date, settings.dateFormat) : '—'}</td>
                        <td className="num">{money(b.total)}</td>
                        <td className="num">
                          <strong>{money(b.due)}</strong>
                        </td>
                        <td>
                          <span className={`badge ${b.state === 'partial' ? 'badge-partial' : overdue ? 'badge-cancelled' : 'badge-issued'}`} data-testid="open-bill-state">
                            {overdue && b.state === 'unpaid' ? 'Overdue' : STATE_LABEL[b.state]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {paying && (
        <PaymentDialog
          party={party}
          side={paying}
          ledger={ledger}
          onClose={() => setPaying('')}
          onSaved={() => {
            setPaying('');
            load();
          }}
        />
      )}
      {editing && (
        <PartyForm
          initial={party}
          taxSystem={settings.taxSystem}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast.success('Saved');
            load();
          }}
        />
      )}
    </div>
  );
}
