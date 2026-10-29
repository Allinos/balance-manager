/**
 * A customer's / vendor's profile: what they owe or are owed, the bills still open (unpaid, partly paid),
 * and the Give & Get ledger with a running balance. Payments and advances are recorded from here as receipts
 * (customers) or payment vouchers (vendors), so the ledger always agrees with the documents.
 */

import { useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { EmptyState, PageHeader, Spinner, StatusBadge } from '../../components/Common.jsx';
import { balanceLabel, partyLedger, paymentRoute } from '../../services/ledgerService.js';
import { formatDate, todayISO } from '../../utils/dates.js';
import { abs } from '../../utils/decimal.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useMoney } from '../../hooks/useMoney.js';
import PrivacyToggle from '../../components/PrivacyToggle.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import { Link, useRouter } from '../../router/router.jsx';
import { PartyForm } from './PartiesPage.jsx';

const KIND_LABEL = { customer: 'Customer', vendor: 'Vendor', both: 'Customer & vendor' };

export default function PartyLedgerPage({ params }) {
  const { settings } = useAppData();
  const { navigate } = useRouter();
  const toast = useToast();
  const money = useMoney();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

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
  const sides = party.kind === 'both' ? ['customer', 'vendor'] : [party.kind === 'vendor' ? 'vendor' : 'customer'];
  const today = todayISO();
  const signed = (v) => `${money(abs(v))}`;

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
            <PrivacyToggle className="btn" size={16} />
            <button className="btn" onClick={() => setEditing(true)} data-testid="party-profile-edit">
              <Icon name="edit" size={16} /> Edit
            </button>
            {sides.map((side) => (
              <button key={`adv-${side}`} className="btn" onClick={() => navigate(paymentRoute(party, { side }))} data-testid={`party-advance-${side}`}>
                <Icon name="coins" size={16} /> {side === 'vendor' ? 'Advance to vendor' : 'Advance received'}
              </button>
            ))}
            {sides.map((side) => (
              <button
                key={`pay-${side}`}
                className="btn btn-primary"
                onClick={() => {
                  const bill = ledger.open.find((b) => (side === 'vendor' ? b.type === 'PURCHASE_INVOICE' : b.type !== 'PURCHASE_INVOICE'));
                  navigate(paymentRoute(party, { side, bill }));
                }}
                data-testid={`party-pay-${side}`}
              >
                <Icon name="wallet" size={16} /> {side === 'vendor' ? 'Make payment' : 'Receive payment'}
              </button>
            ))}
          </div>
        }
      />

      <div className="ledger-cards" data-testid="party-balance">
        <div className={`ledger-card ${Number(ledger.balance) > 0 ? 'get' : Number(ledger.balance) < 0 ? 'give' : ''}`}>
          <small>{balanceLabel(ledger.balance)}</small>
          <strong data-testid="party-balance-amount">{signed(ledger.balance)}</strong>
        </div>
        <div className="ledger-card">
          <small>You gave (bills, payments made)</small>
          <strong>{money(ledger.totalGave)}</strong>
        </div>
        <div className="ledger-card">
          <small>You got (payments, bills received)</small>
          <strong>{money(ledger.totalGot)}</strong>
        </div>
        <div className="ledger-card">
          <small>{ledger.advanceKind === 'paid' ? 'Advance paid' : 'Advance received'}</small>
          <strong data-testid="party-advance">{money(ledger.advance)}</strong>
        </div>
      </div>

      <section className="card">
        <div className="card-header">
          <h2>Open bills</h2>
          <span className="muted small">Unpaid and partly paid — record a payment against one</span>
        </div>
        {ledger.open.length === 0 ? (
          <p className="muted" data-testid="open-bills-empty">Nothing outstanding.</p>
        ) : (
          <table className="table" data-testid="open-bills">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Date</th>
                <th>Due</th>
                <th className="num">Total</th>
                <th className="num">Paid</th>
                <th className="num">Balance due</th>
                <th>Status</th>
                <th className="actions-col" />
              </tr>
            </thead>
            <tbody>
              {ledger.open.map((b) => {
                const overdue = b.due_date && b.due_date < today;
                return (
                  <tr key={b.id} data-testid="open-bill">
                    <td>
                      <Link to={`/doc/${b.id}`}>
                        <strong>{b.number}</strong>
                      </Link>{' '}
                      <span className="muted small">{b.label}</span>
                    </td>
                    <td>{formatDate(b.date, settings.dateFormat)}</td>
                    <td className={overdue ? 'text-danger' : ''}>{b.due_date ? formatDate(b.due_date, settings.dateFormat) : '—'}</td>
                    <td className="num">{money(b.total)}</td>
                    <td className="num">{money(b.paid)}</td>
                    <td className="num">
                      <strong>{money(b.due)}</strong>
                    </td>
                    <td>
                      <span className={`badge ${b.state === 'partial' ? 'badge-partial' : overdue ? 'badge-cancelled' : 'badge-issued'}`}>
                        {b.state === 'partial' ? 'Partly paid' : overdue ? 'Overdue' : 'Unpaid'}
                      </span>
                    </td>
                    <td className="actions-col">
                      <button className="btn btn-sm" onClick={() => navigate(paymentRoute(party, { bill: b }))} data-testid="open-bill-pay">
                        {b.type === 'PURCHASE_INVOICE' ? 'Pay' : 'Receive'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card table-card">
        <div className="card-header">
          <h2>Give &amp; Get ledger</h2>
          <span className="muted small">Every bill and payment, oldest first, with the running balance</span>
        </div>
        {ledger.rows.length === 0 ? (
          <EmptyState icon="book" title="No transactions yet" message="Invoices, bills, receipts and payments of this party appear here automatically." />
        ) : (
          <table className="table ledger-table" data-testid="ledger-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Particulars</th>
                <th>Status</th>
                <th className="num">You gave</th>
                <th className="num">You got</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/doc/${r.id}`)} className="clickable" data-testid="ledger-row">
                  <td>{formatDate(r.date, settings.dateFormat)}</td>
                  <td>
                    <strong>{r.label}</strong> {r.number}
                    {r.against && <span className="muted small"> · against {r.against}</span>}
                    {r.advance && <span className="badge badge-info">Advance</span>}
                  </td>
                  <td>
                    <StatusBadge status={r.status} type={r.type} />
                  </td>
                  <td className="num give">{r.gave ? money(r.gave) : ''}</td>
                  <td className="num get">{r.got ? money(r.got) : ''}</td>
                  <td className="num">
                    {signed(r.balance)} <span className="muted small">{Number(r.balance) > 0 ? 'Get' : Number(r.balance) < 0 ? 'Give' : ''}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

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
