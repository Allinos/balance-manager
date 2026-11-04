/**
 * A customer's / vendor's ledger on the phone (and in the Android app) with Payment & Ledger on — compact:
 *   - the balance (I'll get / I'll give) with "Unpaid bills (n)", which opens all the party's unpaid bills;
 *   - the ledger like a chat: oldest at the top, the latest at the bottom (where the page opens); Filter (top bar)
 *     shows one period only. An entry made here can be opened and deleted;
 *   - above the buttons, one compact reminder row: an optional due date and Send reminder (WhatsApp or SMS);
 *   - at the bottom, Given (left) and Received (right): add a ledger entry straight away, without a bill —
 *     reason, date, amount and payment mode. A payment reason saves a receipt / payment voucher that clears the
 *     oldest bills first (ledgerService.recordLedgerEntry).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { currencyInfo, deleteDocument } from '@desktop/services/documentService.js';
import { PAYMENT_MODES } from '@desktop/config/documentTypes.js';
import { ledgerOn } from '@desktop/services/billPayment.js';
import { ENTRY_REASONS, LEDGER_PERIODS, PAYMENT_SIDES, allocate, balanceLabel, entrySide, ledgerPeriod, partyLedger, periodTotals, recordLedgerEntry, rowsBetween } from '@desktop/services/ledgerService.js';
import { formatMoney } from '@desktop/utils/format.js';
import { formatDate, todayISO } from '@desktop/utils/dates.js';
import { abs, dec, toFixed } from '@desktop/utils/decimal.js';
import { maskAmount, useAmountsHidden } from '@desktop/hooks/usePrivacy.js';
import PrivacyToggle from '@desktop/components/PrivacyToggle.jsx';
import Icon from '../components/Icon.jsx';
import { Empty, Field, Header, NumberInput, Sheet, Spinner, back, go, useUi } from '../components/ui.jsx';
import DateInput from '../components/DateInput.jsx';
import { useApp, useDocContext } from '../data.jsx';
import { PartySheet } from './Parties.jsx';
import { phoneDigits, sendSmsReminder, sendWhatsAppReminder, smsAlert } from '../lib/notify.js';
import { native, reportEvent } from '../lib/native.js';
import { isLimitError } from '../lib/plan.js';
import { syncDues } from '../lib/dues.js';
import { AccountSheet, needsAccount, useFreeLimit } from './Android.jsx';

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
const smsHint = () => (native() ? 'Sent from your phone (normal SMS charges)' : 'Opens your SMS app with the message');
const NO_FILTER = { period: 'all', from: '', to: '' };

/** WhatsApp and SMS marks for the reminder buttons. */
function WhatsAppMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.5-.4z" />
    </svg>
  );
}
function SmsMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </svg>
  );
}

/** Given / Received: reason, date, amount and payment mode. */
function EntrySheet({ party, direction, ledger, onClose, onSaved }) {
  const ctx = useDocContext();
  const { toast } = useUi();
  const freeLimit = useFreeLimit();
  const money = useMoney();
  const side = entrySide(party);
  const reasons = ENTRY_REASONS[side][direction];
  const [reasonId, setReasonId] = useState(reasons[0].id);
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [saving, setSaving] = useState(false);
  const reason = reasons.find((r) => r.id === reasonId) || reasons[0];
  const has = dec(amount || '0') > 0n;
  // A payment (or goods back) clears the oldest bills first: show which.
  const plan = reason.pay ? allocate(ledger, reason.pay, amount) : null;
  const after = dec(ledger.balance) + BigInt(direction === 'gave' ? 1 : -1) * dec(amount || '0');
  const title = direction === 'gave' ? `Given to ${party.name}` : `Received from ${party.name}`;

  const save = async (e) => {
    e?.preventDefault();
    if (saving || !has || !date) return;
    setSaving(true);
    try {
      const saved = await recordLedgerEntry({ party, direction, reasonId: reason.id, amount, mode, date, ledger, ctx });
      toast(`${reason.label}: ${money(amount)} saved${saved.payment ? ` as ${saved.document_number}` : ''}`);
      if (saved.payment) {
        const doc = { document_type: PAYMENT_SIDES[reason.pay].type, document_number: saved.document_number, status: 'ISSUED', issue_date: date, party_name: party.name, party_phone: party.phone, grand_total: amount };
        smsAlert(doc, ctx).then((r) => r === 'sent' && toast(`SMS sent to ${party.name}`));
        reportEvent('doc_saved');
      }
      syncDues(ctx.settings);
      onSaved();
    } catch (err) {
      setSaving(false);
      if (!isLimitError(err)) toast(err.message, 'bad');
      // Free plan (Android app): a rewarded ad earns one more, then it is saved again.
      else if (await freeLimit(err)) save();
    }
  };

  return (
    <Sheet title={title} onClose={onClose} testId="entry-sheet">
      <form onSubmit={save} className="entry-form">
        <span className="field-label">Reason</span>
        <div className="mode-chips" role="radiogroup" data-testid="entry-reason">
          {reasons.map((r) => (
            <button type="button" key={r.id} role="radio" aria-checked={reasonId === r.id} className={reasonId === r.id ? 'on' : ''} onClick={() => setReasonId(r.id)} data-testid={`entry-reason-${r.id}`}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="entry-row">
          <label className="field">
            <span className="field-label">Amount</span>
            <NumberInput className="input pay-amount" placeholder="0.00" value={amount} onChange={setAmount} inputMode="decimal" autoFocus data-testid="entry-amount" />
          </label>
          <label className="field">
            <span className="field-label">Date</span>
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} required data-testid="entry-date" />
          </label>
        </div>
        <span className="field-label">Payment mode</span>
        <div className="mode-chips" role="radiogroup" data-testid="entry-mode">
          {PAYMENT_MODES.map((m) => (
            <button type="button" key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)} data-testid={`entry-mode-${m}`}>
              {m}
            </button>
          ))}
        </div>
        {has && (
          <div className="pay-plan" data-testid="entry-settles">
            {plan?.settles.map((s) => (
              <div key={s.id}>
                <span>
                  Settles {s.number || 'bill'}
                  {!s.clears ? ' (part)' : ''}
                </span>
                <span>{money(s.amount)}</span>
              </div>
            ))}
            <div className="pay-plan-total">
              <strong>Balance after</strong>
              <strong className={tone(after)}>{after === 0n ? `${money('0')} · settled` : `${money(abs(after))} · ${balanceLabel(after)}`}</strong>
            </div>
          </div>
        )}
        <button type="submit" className={`btn btn-block ${direction === 'gave' ? 'btn-danger-solid' : 'btn-green'}`} disabled={saving || !has || !date} data-testid="entry-save">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Sheet>
  );
}

/** All unpaid bills of the party, with the total. */
function UnpaidSheet({ ledger, onClose }) {
  const { settings } = useApp();
  const money = useMoney();
  const today = todayISO();
  const total = ledger.open.reduce((s, b) => s + dec(b.due), 0n);
  return (
    <Sheet title={`Unpaid bills (${ledger.open.length})`} onClose={onClose} testId="unpaid-sheet">
      {ledger.open.length === 0 ? (
        <p className="small muted" data-testid="open-bills-empty">
          Nothing outstanding.
        </p>
      ) : (
        <>
          <div className="unpaid-list" data-testid="open-bills">
            {ledger.open.map((b) => {
              const overdue = b.due_date && b.due_date < today;
              return (
                <button type="button" className="unpaid-row" key={b.id} onClick={() => go(`/doc/${b.id}`)} data-testid="open-bill">
                  <span className="unpaid-main">
                    <strong>{b.number}</strong>
                    <span className="small muted">
                      {formatDate(b.date, settings.dateFormat)}
                      {b.due_date ? ` · due ${formatDate(b.due_date, settings.dateFormat)}` : ''}
                    </span>
                  </span>
                  <span className="unpaid-amt">
                    <strong>{money(b.due)}</strong>
                    <span className={`pill ${overdue ? 'CANCELLED' : b.state === 'partial' ? 'PARTIAL' : 'ISSUED'}`} data-testid="open-bill-state">
                      {overdue ? 'Overdue' : STATE_LABEL[b.state]}
                    </span>
                  </span>
                  {b.state === 'partial' && (
                    <span className="small muted unpaid-paid">
                      {money(b.paid)} paid of {money(b.total)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="unpaid-total" data-testid="unpaid-total">
            <span>Total due</span>
            <strong>{money(toFixed(total, 2))}</strong>
          </div>
        </>
      )}
    </Sheet>
  );
}

/** An entry made here (Given / Received without a bill): its details, and Delete. */
function EntryDetails({ row, onClose, onDeleted }) {
  const { settings } = useApp();
  const { toast, confirm } = useUi();
  const money = useMoney();
  const remove = async () => {
    if (!(await confirm({ title: 'Delete this entry?', message: `${row.label}, ${money(row.gave || row.got)} on ${formatDate(row.date, settings.dateFormat)}.`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      await deleteDocument(row.id);
      toast('Entry deleted');
      onDeleted();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  return (
    <Sheet title={row.gave ? 'Given' : 'Received'} onClose={onClose} testId="ledger-entry-sheet">
      <dl className="kv">
        <dt>Reason</dt>
        <dd>{row.label}</dd>
        <dt>Amount</dt>
        <dd>{money(row.gave || row.got)}</dd>
        <dt>Date</dt>
        <dd>{formatDate(row.date, settings.dateFormat)}</dd>
        <dt>Mode</dt>
        <dd>{row.mode || '—'}</dd>
      </dl>
      <button className="btn btn-block btn-danger" style={{ marginTop: 14 }} onClick={remove} data-testid="ledger-entry-delete">
        <Icon name="trash" size={17} /> Delete entry
      </button>
    </Sheet>
  );
}

/**
 * One compact row above Given / Received: an optional due date ("kindly pay by") and Send reminder, which offers
 * WhatsApp or SMS. SMS goes out by itself through the phone (Android app, after asking for the SMS permission);
 * otherwise the SMS app opens with the message ready.
 */
function ReminderRow({ party, due }) {
  const { company } = useApp();
  const { toast } = useUi();
  const money = useMoney();
  const [payBy, setPayBy] = useState('');
  const [choosing, setChoosing] = useState(false);
  const args = { phone: party.phone, name: party.name, due, company, upi: company?.upi_id, payBy };
  const whatsapp = () => {
    setChoosing(false);
    sendWhatsAppReminder(args);
  };
  const sms = async () => {
    setChoosing(false);
    if (native() && phoneDigits(party.phone)) toast('Sending the SMS…', 'info');
    const r = await sendSmsReminder(args);
    if (r === 'no phone') toast(`Add ${party.name}'s mobile number (Edit) to send an SMS.`, 'bad');
    else if (r === 'sent') toast(`Reminder sent by SMS to ${party.name}`);
    else if (r === 'failed') toast('The SMS could not be sent. Check the SIM and the balance, then try again.', 'bad');
  };
  return (
    <div className="reminder-row" data-testid="reminder-section">
      <DateInput value={payBy} min={todayISO()} onChange={(e) => setPayBy(e.target.value)} placeholder="Due date" title="Kindly pay by" aria-label="Due date (optional)" data-testid="reminder-paydate" />
      <button type="button" className="btn reminder-send" onClick={() => setChoosing(true)} data-testid="reminder-send">
        <Icon name="message" size={17} /> Send reminder
      </button>
      {choosing && (
        <Sheet title={`Remind ${party.name}`} onClose={() => setChoosing(false)} testId="reminder-sheet">
          <p className="small muted" style={{ margin: 0 }}>
            {money(due)} due
            {payBy ? ` · pay by ${formatDate(payBy, 'DD MMM YYYY')}` : ''}
          </p>
          <div className="reminder-choices">
            <button type="button" className="reminder-choice reminder-wa" onClick={whatsapp} data-testid="reminder-whatsapp">
              <span className="reminder-logo wa">
                <WhatsAppMark />
              </span>
              <span>
                <strong>WhatsApp</strong>
                <span className="small muted">Opens WhatsApp with the message</span>
              </span>
            </button>
            <button type="button" className="reminder-choice reminder-sms" onClick={sms} disabled={!phoneDigits(party.phone)} data-testid="reminder-sms">
              <span className="reminder-logo sms">
                <SmsMark />
              </span>
              <span>
                <strong>SMS</strong>
                <span className="small muted">{phoneDigits(party.phone) ? smsHint() : 'Add a mobile number first'}</span>
              </span>
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** Filter (top bar): one period of the ledger. */
function FilterSheet({ value, onApply, onClose }) {
  const [period, setPeriod] = useState(value.period);
  const [custom, setCustom] = useState({ from: value.from, to: value.to });
  const apply = (id, c = custom) => onApply({ period: id, ...ledgerPeriod(id, c) });
  return (
    <Sheet title="Filter by date" onClose={onClose} testId="ledger-filter-sheet">
      <div className="mode-chips" role="radiogroup">
        {LEDGER_PERIODS.map((p) => (
          <button
            type="button"
            key={p.value}
            role="radio"
            aria-checked={period === p.value}
            className={period === p.value ? 'on' : ''}
            onClick={() => (p.value === 'custom' ? setPeriod('custom') : apply(p.value))}
            data-testid={`ledger-period-${p.value}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <>
          <div className="entry-row">
            <Field label="From">
              <DateInput value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom({ ...custom, from: e.target.value })} data-testid="ledger-from" />
            </Field>
            <Field label="To">
              <DateInput value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom({ ...custom, to: e.target.value })} data-testid="ledger-to" />
            </Field>
          </div>
          <button type="button" className="btn btn-primary btn-block" disabled={!custom.from && !custom.to} onClick={() => apply('custom')} data-testid="ledger-filter-apply">
            Show
          </button>
        </>
      )}
    </Sheet>
  );
}

export default function PartyLedger({ id }) {
  const { settings, lic, account } = useApp();
  const { toast } = useUi();
  const money = useMoney();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [entry, setEntry] = useState('');
  const [unpaid, setUnpaid] = useState(false);
  const [details, setDetails] = useState(null);
  const [filter, setFilter] = useState(NO_FILTER);
  const [filtering, setFiltering] = useState(false);
  const [askAccount, setAskAccount] = useState('');
  // Android free plan: the free account comes first (like a new document).
  const openEntry = (direction) => (needsAccount(lic, account) ? setAskAccount(direction) : setEntry(direction));
  const end = useRef(null);
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
  // Like a chat: open at the latest entry (the bottom), and again after an entry is added or the filter changes.
  useEffect(() => {
    if (data && withLedger) end.current?.scrollIntoView({ block: 'end' });
  }, [data, filter, withLedger]);

  if (!data) return <Spinner />;
  const { party, ledger } = data;
  const owes = dec(ledger.balance) > 0n;
  const filtered = filter.period !== 'all';
  const rows = rowsBetween(ledger.rows, filter);
  const inPeriod = filtered ? periodTotals(rows) : null;
  const periodText =
    filter.period === 'custom' ? [filter.from, filter.to].map((d) => (d ? formatDate(d, settings.dateFormat) : '…')).join(' – ') : LEDGER_PERIODS.find((p) => p.value === filter.period)?.label;

  return (
    <>
      <Header
        title={party.name}
        subtitle={[KIND_LABEL[party.kind] || 'Customer', party.phone].filter(Boolean).join(' · ')}
        onBack={() => back('/parties/all')}
        actions={
          <>
            {withLedger && (
              <button className={`icon-btn ${filtered ? 'on' : ''}`} onClick={() => setFiltering(true)} aria-label="Filter by date" data-testid="ledger-filter">
                <Icon name="filter" size={20} />
              </button>
            )}
            {withLedger && <PrivacyToggle className="icon-btn" size={20} />}
            <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit" data-testid="party-profile-edit">
              <Icon name="edit" size={20} />
            </button>
          </>
        }
      />
      <div className={`page ${withLedger ? 'ledger-page' : ''}${withLedger && owes ? ' with-reminder' : ''}`} data-testid="party-ledger">
        {!withLedger ? (
          <div className="card small muted" data-testid="ledger-off">
            Switch on <strong>Payment &amp; Ledger</strong> in Settings → Features to take payments on bills and see what {party.name} owes you or you owe them.
          </div>
        ) : (
          <>
            <div className={`balance-strip ${tone(ledger.balance)}`} data-testid="party-balance">
              <span className="balance-strip-main">
                <span className="small muted">{balanceLabel(ledger.balance)}</span>
                <strong data-testid="party-balance-amount">{money(abs(ledger.balance))}</strong>
              </span>
              <button className="btn btn-sm" onClick={() => setUnpaid(true)} data-testid="view-unpaid">
                Unpaid bills ({ledger.open.length})
              </button>
            </div>

            {filtered && (
              <div className="filter-bar" data-testid="ledger-filter-bar">
                <span>
                  <Icon name="filter" size={14} /> <strong>{periodText}</strong>
                  <span className="small muted">
                    {' '}
                    · gave {money(inPeriod.gave)} · got {money(inPeriod.got)}
                  </span>
                </span>
                <button className="link-btn" onClick={() => setFilter(NO_FILTER)} data-testid="ledger-filter-clear">
                  Clear
                </button>
              </div>
            )}
            <div className="section-label">Ledger · oldest first</div>
            {rows.length === 0 ? (
              filtered ? (
                <Empty icon="calendar" title="Nothing in this period" message="Choose another period with Filter, or clear the filter." />
              ) : (
                <Empty icon="book" title="No transactions yet" message="Bills, payments and entries you add with Given / Received appear here." />
              )
            ) : (
              <div className="list ledger-list" data-testid="ledger-table">
                {rows.map((r) => (
                  <button type="button" key={r.key} className="ledger-row" onClick={() => (r.entry ? setDetails(r) : go(`/doc/${r.id}`))} data-testid="ledger-row">
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
            <div ref={end} className="ledger-end" />

            <div className={`ledger-actions no-print ${owes ? 'with-reminder' : ''}`} data-testid="ledger-actions">
              {owes && <ReminderRow party={party} due={ledger.balance} />}
              <button className="btn ledger-given" onClick={() => openEntry('gave')} data-testid="ledger-given">
                <span aria-hidden="true">↑</span> Given
              </button>
              <button className="btn ledger-received" onClick={() => openEntry('got')} data-testid="ledger-received">
                <span aria-hidden="true">↓</span> Received
              </button>
            </div>
          </>
        )}
      </div>
      {entry && (
        <EntrySheet
          party={party}
          direction={entry}
          ledger={ledger}
          onClose={() => setEntry('')}
          onSaved={() => {
            setEntry('');
            load();
          }}
        />
      )}
      {askAccount && (
        <AccountSheet
          onClose={() => setAskAccount('')}
          onDone={() => {
            setEntry(askAccount);
            setAskAccount('');
          }}
        />
      )}
      {filtering && (
        <FilterSheet
          value={filter}
          onClose={() => setFiltering(false)}
          onApply={(f) => {
            setFiltering(false);
            setFilter(f);
          }}
        />
      )}
      {unpaid && <UnpaidSheet ledger={ledger} onClose={() => setUnpaid(false)} />}
      {details && (
        <EntryDetails
          row={details}
          onClose={() => setDetails(null)}
          onDeleted={() => {
            setDetails(null);
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
