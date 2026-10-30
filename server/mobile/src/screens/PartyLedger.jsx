/**
 * A customer's / vendor's profile on the phone (Payment & Ledger on): I'll get / I'll give, one big
 * Payment received (customer) / Payment made (vendor) button, the ledger and the unpaid bills — the desktop's
 * PartyLedgerPage. The payment sheet asks only for the amount and the mode, and clears the oldest bills first.
 */

import { useCallback, useEffect, useState } from 'react';
import { currencyInfo } from '@desktop/services/documentService.js';
import { PAYMENT_MODES } from '@desktop/config/documentTypes.js';
import { ledgerOn } from '@desktop/services/billPayment.js';
import { allocate, balanceLabel, partyLedger, PAYMENT_SIDES, recordPayment, sidesOf } from '@desktop/services/ledgerService.js';
import { formatMoney } from '@desktop/utils/format.js';
import { formatDate, todayISO } from '@desktop/utils/dates.js';
import { abs, dec } from '@desktop/utils/decimal.js';
import { maskAmount, useAmountsHidden } from '@desktop/hooks/usePrivacy.js';
import PrivacyToggle from '@desktop/components/PrivacyToggle.jsx';
import Icon from '../components/Icon.jsx';
import { Empty, Header, NumberInput, Sheet, Spinner, back, go, useUi } from '../components/ui.jsx';
import { useApp, useDocContext } from '../data.jsx';
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
const tone = (v) => (dec(v) > 0n ? 'get' : dec(v) < 0n ? 'give' : '');
const STATE_LABEL = { unpaid: 'Unpaid', partial: 'Partly paid' };

/** Bottom sheet: amount and mode only, then what it will settle. */
function PaymentSheet({ party, side, ledger, onClose, onSaved }) {
  const ctx = useDocContext();
  const { toast } = useUi();
  const money = useMoney();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [saving, setSaving] = useState(false);
  const labels = PAYMENT_SIDES[side];
  const plan = allocate(ledger, side, amount);
  const after = dec(plan.balanceAfter);
  const has = dec(amount || '0') > 0n;

  const save = async (e) => {
    e.preventDefault();
    if (saving || !has) return;
    setSaving(true);
    try {
      const saved = await recordPayment({ party, side, amount, mode, ledger, ctx });
      toast(`${labels.button}: ${money(amount)} saved as ${saved.document_number}`);
      onSaved();
    } catch (err) {
      toast(err.message, 'bad');
      setSaving(false);
    }
  };

  return (
    <Sheet title={labels.button} onClose={onClose} testId="pay-sheet">
      <form onSubmit={save} className="pay-sheet">
        <label className="field">
          <span className="field-label">{labels.amount}</span>
          <NumberInput className="input pay-amount" placeholder="0.00" value={amount} onChange={setAmount} inputMode="decimal" autoFocus data-testid="pay-amount" />
        </label>
        <span className="field-label">Payment mode</span>
        <div className="mode-chips" role="radiogroup" data-testid="pay-mode">
          {PAYMENT_MODES.map((m) => (
            <button type="button" key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)} data-testid={`pay-mode-${m}`}>
              {m}
            </button>
          ))}
        </div>
        {has && (
          <div className="pay-plan" data-testid="pay-settles">
            {plan.settles.map((s) => (
              <div key={s.id}>
                <span>
                  Settles {s.number || 'bill'}
                  {!s.clears ? ' (part)' : ''}
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
              <strong>Balance after</strong>
              <strong className={tone(after)}>{after === 0n ? `${money('0')} · settled` : `${money(abs(after))} · ${balanceLabel(after)}`}</strong>
            </div>
          </div>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={saving || !has} data-testid="pay-save">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Sheet>
  );
}

export default function PartyLedger({ id }) {
  const { settings } = useApp();
  const { toast } = useUi();
  const money = useMoney();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState('');
  const withLedger = ledgerOn(settings);

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
  const today = todayISO();

  return (
    <>
      <Header
        title={party.name}
        subtitle={[KIND_LABEL[party.kind] || 'Customer', party.phone].filter(Boolean).join(' · ')}
        onBack={() => back('/parties/all')}
        actions={
          <>
            {withLedger && <PrivacyToggle className="icon-btn" size={20} />}
            <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit" data-testid="party-profile-edit">
              <Icon name="edit" size={20} />
            </button>
          </>
        }
      />
      <div className="page" data-testid="party-ledger">
        {!withLedger ? (
          <div className="card small muted" data-testid="ledger-off">
            Switch on <strong>Payment &amp; Ledger</strong> in Settings → Features to take payments on bills and see what {party.name} owes you or you owe them.
          </div>
        ) : (
          <>
            <div className={`card balance-card ${tone(ledger.balance)}`} data-testid="party-balance">
              <span className="small muted">{balanceLabel(ledger.balance)}</span>
              <strong data-testid="party-balance-amount">{money(abs(ledger.balance))}</strong>
              <span className="small muted">{ledger.open.length === 0 ? 'No unpaid bills' : `${ledger.open.length} bill${ledger.open.length > 1 ? 's' : ''} unpaid`}</span>
            </div>
            {sidesOf(party).map((side) => (
              <button key={side} className="btn btn-primary btn-block btn-lg" onClick={() => setPaying(side)} data-testid={`party-pay-${side}`}>
                <Icon name="wallet" size={18} /> {PAYMENT_SIDES[side].button}
              </button>
            ))}

            <div className="section-label">Ledger</div>
            {ledger.rows.length === 0 ? (
              <Empty icon="book" title="No transactions yet" message="Invoices, bills and payments of this party appear here automatically." />
            ) : (
              <div className="list ledger-list" data-testid="ledger-table">
                {[...ledger.rows].reverse().map((r) => (
                  <button type="button" key={r.key} className="ledger-row" onClick={() => go(`/doc/${r.id}`)} data-testid="ledger-row">
                    <span className="ledger-what">
                      <strong>
                        {r.label} {r.number}
                      </strong>
                      <span className="small muted">
                        {formatDate(r.date, settings.dateFormat)}
                        {r.mode ? ` · ${r.mode}` : ''}
                        {r.against ? ` · ${r.onBill ? 'on' : 'against'} ${r.against}` : ''}
                      </span>
                    </span>
                    <span className="ledger-amt">
                      <strong className={r.gave ? 'give' : 'get'}>{r.gave ? `+${money(r.gave)}` : `−${money(r.got)}`}</strong>
                      <span className="small muted">
                        {money(abs(r.balance))} {dec(r.balance) > 0n ? 'get' : dec(r.balance) < 0n ? 'give' : ''}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="section-label">Unpaid bills</div>
            {ledger.open.length === 0 ? (
              <p className="small muted" data-testid="open-bills-empty">
                Nothing outstanding.
              </p>
            ) : (
              <div className="list" data-testid="open-bills">
                {ledger.open.map((b) => {
                  const overdue = b.due_date && b.due_date < today && b.state === 'unpaid';
                  return (
                    <button type="button" className="list-item plain" key={b.id} onClick={() => go(`/doc/${b.id}`)} data-testid="open-bill">
                      <span className="list-main">
                        <strong>
                          {b.number}{' '}
                          <span className={`pill ${b.state === 'partial' ? 'PARTIAL' : overdue ? 'CANCELLED' : 'ISSUED'}`} data-testid="open-bill-state">
                            {overdue ? 'Overdue' : STATE_LABEL[b.state]}
                          </span>
                        </strong>
                        <span className="small muted">
                          {b.label} · {formatDate(b.date, settings.dateFormat)} · total {money(b.total)}
                        </span>
                      </span>
                      <strong className="list-end">{money(b.due)}</strong>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      {paying && (
        <PaymentSheet
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
