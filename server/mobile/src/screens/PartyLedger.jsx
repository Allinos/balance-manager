/**
 * A customer's / vendor's profile on the phone: balance (You'll get / You'll give), Receive / Make payment,
 * Advance, the open bills and the Give & Get ledger with the running balance — the desktop's PartyLedgerPage.
 */

import { useCallback, useEffect, useState } from 'react';
import { currencyInfo } from '@desktop/services/documentService.js';
import { balanceLabel, partyLedger, paymentRoute } from '@desktop/services/ledgerService.js';
import { formatMoney } from '@desktop/utils/format.js';
import { formatDate, todayISO } from '@desktop/utils/dates.js';
import { abs } from '@desktop/utils/decimal.js';
import { maskAmount, useAmountsHidden } from '@desktop/hooks/usePrivacy.js';
import PrivacyToggle from '@desktop/components/PrivacyToggle.jsx';
import Icon from '../components/Icon.jsx';
import { Empty, Header, Spinner, StatusBadge, back, go, useUi } from '../components/ui.jsx';
import { useApp } from '../data.jsx';
import { PartySheet } from './Parties.jsx';

/** Money in the base currency, hidden while the privacy eye is on. */
export function useMoney() {
  const { settings } = useApp();
  const [hidden] = useAmountsHidden();
  const cur = currencyInfo(settings, settings.baseCurrency);
  const d = { currency: cur.code, currency_symbol: cur.symbol, currency_decimals: cur.decimals };
  return (v) => maskAmount(formatMoney(v, d), hidden, cur.symbol);
}

const KIND_LABEL = { customer: 'Customer', vendor: 'Vendor', both: 'Customer & vendor' };
const tone = (v) => (Number(v) > 0 ? 'get' : Number(v) < 0 ? 'give' : '');

export default function PartyLedger({ id }) {
  const { settings } = useApp();
  const { toast } = useUi();
  const money = useMoney();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await partyLedger(id));
    } catch (e) {
      toast(e.message, 'bad');
    }
  }, [id, toast]);
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <Spinner />;
  const { party, ledger } = data;
  const sides = party.kind === 'both' ? ['customer', 'vendor'] : [party.kind === 'vendor' ? 'vendor' : 'customer'];
  const today = todayISO();

  return (
    <>
      <Header
        title={party.name}
        subtitle={[KIND_LABEL[party.kind] || 'Customer', party.phone].filter(Boolean).join(' · ')}
        onBack={() => back('/parties/all')}
        actions={
          <>
            <PrivacyToggle className="icon-btn" size={20} />
            <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit" data-testid="party-profile-edit">
              <Icon name="edit" size={20} />
            </button>
          </>
        }
      />
      <div className="page" data-testid="party-ledger">
        <div className={`card balance-card ${tone(ledger.balance)}`} data-testid="party-balance">
          <span className="small muted">{balanceLabel(ledger.balance)}</span>
          <strong data-testid="party-balance-amount">{money(abs(ledger.balance))}</strong>
          <div className="balance-split small muted">
            <span>Gave {money(ledger.totalGave)}</span>
            <span>Got {money(ledger.totalGot)}</span>
            {Number(ledger.advance) > 0 && <span data-testid="party-advance">{ledger.advanceKind === 'paid' ? 'Advance paid' : 'Advance'} {money(ledger.advance)}</span>}
          </div>
        </div>
        {sides.map((side) => (
          <div className="grid-2" key={side}>
            <button
              className="btn btn-primary"
              onClick={() => {
                const bill = ledger.open.find((b) => (side === 'vendor' ? b.type === 'PURCHASE_INVOICE' : b.type !== 'PURCHASE_INVOICE'));
                go(paymentRoute(party, { side, bill }));
              }}
              data-testid={`party-pay-${side}`}
            >
              <Icon name="wallet" size={18} /> {side === 'vendor' ? 'Make payment' : 'Receive payment'}
            </button>
            <button className="btn" onClick={() => go(paymentRoute(party, { side }))} data-testid={`party-advance-${side}`}>
              <Icon name="coins" size={18} /> {side === 'vendor' ? 'Advance paid' : 'Advance received'}
            </button>
          </div>
        ))}

        <div className="section-label">Open bills</div>
        {ledger.open.length === 0 ? (
          <p className="small muted" data-testid="open-bills-empty">
            Nothing outstanding.
          </p>
        ) : (
          <div className="list" data-testid="open-bills">
            {ledger.open.map((b) => {
              const overdue = b.due_date && b.due_date < today;
              return (
                <div className="list-item" key={b.id} data-testid="open-bill">
                  <button type="button" className="list-main plain" onClick={() => go(`/doc/${b.id}`)}>
                    <strong>
                      {b.number} <span className={`pill ${b.state === 'partial' ? 'PARTIAL' : overdue ? 'CANCELLED' : 'ISSUED'}`}>{b.state === 'partial' ? 'Partly paid' : overdue ? 'Overdue' : 'Unpaid'}</span>
                    </strong>
                    <span className="small muted">
                      {b.label} · {formatDate(b.date, settings.dateFormat)} · paid {money(b.paid)} of {money(b.total)}
                    </span>
                  </button>
                  <span className="list-end">
                    <strong>{money(b.due)}</strong>
                    <button className="btn btn-sm" onClick={() => go(paymentRoute(party, { bill: b }))} data-testid="open-bill-pay">
                      {b.type === 'PURCHASE_INVOICE' ? 'Pay' : 'Receive'}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="section-label">Give &amp; Get ledger</div>
        {ledger.rows.length === 0 ? (
          <Empty icon="book" title="No transactions yet" message="Invoices, bills, receipts and payments of this party appear here automatically." />
        ) : (
          <div className="list ledger-list" data-testid="ledger-table">
            <div className="ledger-head small muted">
              <span>Particulars</span>
              <span>Gave</span>
              <span>Got</span>
              <span>Balance</span>
            </div>
            {[...ledger.rows].reverse().map((r) => (
              <button type="button" key={r.id} className="ledger-row" onClick={() => go(`/doc/${r.id}`)} data-testid="ledger-row">
                <span className="ledger-what">
                  <strong>
                    {r.label} {r.number}
                  </strong>
                  <span className="small muted">
                    {formatDate(r.date, settings.dateFormat)}
                    {r.against ? ` · against ${r.against}` : ''}
                    {r.advance ? ' · Advance' : ''}
                  </span>
                  <StatusBadge status={r.status} type={r.type} />
                </span>
                <span className="give">{r.gave ? money(r.gave) : ''}</span>
                <span className="get">{r.got ? money(r.got) : ''}</span>
                <span className={tone(r.balance)}>{money(abs(r.balance))}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {editing && (
        <PartySheet
          initial={party}
          taxSystem={settings.taxSystem}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}
    </>
  );
}
