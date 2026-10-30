/**
 * Customers & Vendors (optional, off by default — as on the desktop):
 *   /parties           switch the modules on or off
 *   /parties/customer  list · search · add · edit · delete (archived when on documents) · restore
 *   /parties/vendor
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { STATE_NAMES, isValidGstin, stateCode, stateFromGstin } from '@desktop/config/states.js';
import { LEDGER_FEATURE, PARTY_FEATURE, PARTY_KIND_OPTIONS, enabledModules, partyFeatureOn, partyFeatureValue } from '@desktop/config/partyModules.js';
import { ledgerOn } from '@desktop/services/billPayment.js';
import { archiveParty, deleteParty, queryParties, saveParty } from '@desktop/services/catalogService.js';
import { formatDate } from '@desktop/utils/dates.js';
import { balanceLabel, ledgerSummary } from '@desktop/services/ledgerService.js';
import { abs } from '@desktop/utils/decimal.js';
import PrivacyToggle from '@desktop/components/PrivacyToggle.jsx';
import Icon from '../components/Icon.jsx';
import { useMoney } from './PartyLedger.jsx';
import { Empty, Field, Header, Input, Picker, Segmented, Sheet, Spinner, TextArea, Toggle, back, go, useUi } from '../components/ui.jsx';
import { useApp } from '../data.jsx';

const stateOptions = STATE_NAMES.map((s) => ({ value: s, label: s, hint: stateCode(s) }));
const emptyParty = (kind) => ({ name: '', company_name: '', phone: '', email: '', gstin: '', tax_id: '', state: '', address: '', shipping_address: '', kind, notes: '' });

export function PartySheet({ initial, taxSystem, onClose, onSaved, onDelete }) {
  const { toast } = useUi();
  const [p, setP] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setP((x) => ({ ...x, ...patch }));
  const noun = p.kind === 'vendor' ? 'vendor' : 'customer';
  const onGstin = (v) => {
    const gstin = v.toUpperCase().replace(/\s/g, '');
    const state = stateFromGstin(gstin);
    set(state && !p.state ? { gstin, state } : { gstin });
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!p.name.trim()) return toast(`Please enter the ${noun} name.`, 'bad');
    if (p.gstin && !isValidGstin(p.gstin)) return toast(`The GSTIN "${p.gstin}" is not valid. It has 15 characters, e.g. 27AAPFU0939F1ZV.`, 'bad');
    setSaving(true);
    try {
      const fields = ['id', 'name', 'company_name', 'phone', 'email', 'gstin', 'tax_id', 'state', 'address', 'shipping_address', 'kind', 'notes'];
      await saveParty(Object.fromEntries(fields.filter((k) => p[k] !== undefined).map((k) => [k, typeof p[k] === 'string' ? p[k].trim() : p[k]])));
      toast(`${p.name.trim()} saved`);
      onSaved();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setSaving(false);
    }
    return undefined;
  };
  return (
    <Sheet full title={p.id ? `Edit ${initial.name}` : `Add ${noun}`} onClose={onClose} testId="party-sheet">
      <form className="form" onSubmit={submit}>
        <Field label="Saved as" hint="Customer for sales documents, vendor for purchases, or both.">
          <Segmented value={p.kind} onChange={(kind) => set({ kind })} options={PARTY_KIND_OPTIONS} testId="party-kind" />
        </Field>
        <Field label="Name" required>
          <Input value={p.name} onChange={(v) => set({ name: v })} placeholder={noun === 'vendor' ? 'e.g. Sri Balaji Timbers' : 'e.g. Mehta Interiors Pvt Ltd'} maxLength={120} data-testid="party-form-name" />
        </Field>
        <Field label="Contact person / company">
          <Input value={p.company_name} onChange={(v) => set({ company_name: v })} placeholder="e.g. Rahul Mehta" maxLength={120} />
        </Field>
        <div className="grid-2">
          <Field label="Phone">
            <Input type="tel" value={p.phone} onChange={(v) => set({ phone: v })} placeholder="e.g. 98450 12345" maxLength={40} data-testid="party-form-phone" />
          </Field>
          <Field label="Email">
            <Input type="email" value={p.email} onChange={(v) => set({ email: v })} placeholder="name@example.com" maxLength={120} />
          </Field>
        </div>
        {taxSystem === 'GST' ? (
          <Field label="GSTIN" hint="The state is filled in from it.">
            <Input value={p.gstin} onChange={onGstin} placeholder="e.g. 29ABCDE1234F1Z5" maxLength={15} autoCapitalize="characters" data-testid="party-form-gstin" />
          </Field>
        ) : (
          <Field label="Tax ID / VAT number">
            <Input value={p.tax_id} onChange={(v) => set({ tax_id: v })} placeholder="e.g. 100123456700003" maxLength={40} />
          </Field>
        )}
        <Field label="State">
          <Picker value={p.state} onChange={(v) => set({ state: v || '' })} options={stateOptions} placeholder="Choose state" title="State" creatable clearable testId="party-form-state" />
        </Field>
        <Field label="Billing address">
          <TextArea rows={3} value={p.address} onChange={(v) => set({ address: v })} placeholder={'Building, street, area\nCity – PIN code'} />
        </Field>
        <Field label="Shipping address" hint="Only if goods go to a different address">
          <TextArea rows={2} value={p.shipping_address} onChange={(v) => set({ shipping_address: v })} placeholder="Leave empty if same as billing" />
        </Field>
        <Field label="Notes (not printed)">
          <TextArea rows={2} value={p.notes} onChange={(v) => set({ notes: v })} placeholder="e.g. Credit period 30 days" maxLength={500} />
        </Field>
        <button className="btn btn-primary btn-block" disabled={saving} data-testid="party-form-save">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {p.id && onDelete && (
          <button type="button" className="btn btn-danger btn-block" onClick={() => onDelete(p)} data-testid="party-delete">
            <Icon name="trash" size={18} /> Delete
          </button>
        )}
      </form>
    </Sheet>
  );
}

/** The feature switches: Customers & Vendors, and Payment & Ledger (Settings → Features, and /parties). */
export function PartyModuleSwitches() {
  const { settings, updateSettings } = useApp();
  const { toast } = useUi();
  // Shown switched at once; saved in the background.
  const [shown, setShown] = useState({});
  const partiesOn = shown.parties ?? partyFeatureOn(settings);
  const ledgerIsOn = shown.ledger ?? ledgerOn(settings);
  const toggle = async (id, next) => {
    setShown((s) => ({ ...s, [id]: next }));
    try {
      if (id === 'parties') {
        await updateSettings(partyFeatureValue(next));
        toast(next ? 'Customers & Vendors switched on' : 'Customers & Vendors switched off. Saved records are kept.');
      } else {
        await updateSettings({ [LEDGER_FEATURE.setting]: next });
        toast(next ? 'Payment & Ledger switched on' : 'Payment & Ledger switched off. Recorded payments are kept.');
      }
    } catch (e) {
      setShown((s) => ({ ...s, [id]: !next }));
      toast(e.message, 'bad');
    }
  };
  const cards = [
    { feature: PARTY_FEATURE, on: partiesOn, open: partiesOn },
    { feature: LEDGER_FEATURE, on: ledgerIsOn },
  ];
  return (
    <div className="list">
      {cards.map(({ feature, on, open }) => (
        <div key={feature.id} className="list-item module-row" data-testid={`module-${feature.id}`}>
          <span className="avatar">
            <Icon name={feature.icon} size={19} />
          </span>
          <span className="list-main">
            <strong>{feature.label}</strong>
            <span className="small muted">{feature.description}</span>
            {open && (
              <button type="button" className="link-btn small" onClick={() => go('/parties/all')} data-testid="open-parties">
                Open Customers &amp; Vendors →
              </button>
            )}
          </span>
          <Toggle checked={on} onChange={(v) => toggle(feature.id, v)} label="" aria-label={`${feature.label} feature`} data-testid={`module-${feature.id}-toggle`} />
        </div>
      ))}
    </div>
  );
}

export function PartyModulesSection() {
  return (
    <div className="page" data-testid="settings-parties">
      <p className="small muted">Optional features, off until you switch them on. Documents still remember the names you type either way.</p>
      <PartyModuleSwitches />
      <p className="small muted">
        Deleting never changes your documents: a customer or vendor that appears on any document is archived (hidden, restorable) and every document keeps
        the details printed on it.
      </p>
    </div>
  );
}

/** Customers and vendors together on one screen: All, Customers or Vendors. */
const ALL = { kind: 'all', label: 'Customers & Vendors', singular: 'customer or vendor', icon: 'users' };

export default function Parties({ kind }) {
  const { settings } = useApp();
  const { toast, confirm } = useUi();
  const tabs = enabledModules(settings);
  const withLedger = ledgerOn(settings);
  const mod = tabs.find((m) => m.kind === kind) || (tabs.length === 1 ? tabs[0] : ALL);
  const enabled = !!kind && tabs.length > 0;
  const newKind = mod.kind === 'all' ? 'customer' : mod.kind;
  const [rows, setRows] = useState(null);
  const [totals, setTotals] = useState(null);
  const loadTicket = useRef(0);
  const money = useMoney();
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      const ticket = ++loadTicket.current;
      const list = await queryParties({ kind: mod.kind === 'all' ? '' : mod.kind, archived, search });
      // Balances from the ledger (invoices, bills and payments of each party), with Payment & Ledger on.
      const summary = withLedger ? await ledgerSummary(list) : { parties: list, totals: null };
      // Only the latest request counts (switching Active / Archived quickly must not show an older list).
      if (ticket !== loadTicket.current) return;
      setRows(summary.parties);
      setTotals(summary.totals);
    } catch (e) {
      toast(e.message, 'bad');
    }
  }, [mod.kind, archived, search, toast, withLedger]);
  useEffect(() => {
    if (!enabled) return undefined;
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load, enabled]);

  if (!enabled) {
    return (
      <>
        <Header title="Features" onBack={() => back('/settings')} />
        <PartyModulesSection />
      </>
    );
  }

  const remove = async (p) => {
    const used = Number(p.document_count) > 0;
    const ok = await confirm({
      title: `Delete ${p.name}?`,
      message: used
        ? `${p.name} is on ${p.document_count} document(s), so it will be archived: hidden from lists and suggestions, documents unchanged. Restore it from Archived.`
        : `${p.name} is not on any document and will be deleted.`,
      confirmLabel: used ? 'Archive' : 'Delete',
      danger: !used,
    });
    if (!ok) return;
    try {
      const result = await deleteParty(p.id);
      toast(result === 'archived' ? `${p.name} archived — documents unchanged` : `${p.name} deleted`);
      setEditing(null);
      load();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  const restore = async (p) => {
    try {
      await archiveParty(p.id, false);
      toast(`${p.name} restored`);
      load();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  return (
    <>
      <Header title="Customers & Vendors" actions={<PrivacyToggle className="icon-btn" size={20} />} />
      <div className="page" data-testid={`parties-${mod.kind}`}>
        {withLedger && totals && !archived && (
          <div className="ledger-totals" data-testid="ledger-totals">
            <div className="get">
              <span className="small muted">I&apos;ll get</span>
              <strong data-testid="total-receivable">{money(totals.receivable)}</strong>
            </div>
            <div className="give">
              <span className="small muted">I&apos;ll give</span>
              <strong data-testid="total-payable">{money(totals.payable)}</strong>
            </div>
          </div>
        )}
        {tabs.length > 1 && (
          <Segmented
            value={mod.kind}
            onChange={(k) => go(`/parties/${k}`)}
            options={[{ value: 'all', label: 'All' }, ...tabs.map((m) => ({ value: m.kind, label: m.label }))]}
            testId="party-tabs"
          />
        )}
        <div className="search">
          <Icon name="search" size={18} />
          <input className="input" placeholder="Name, phone, email or GSTIN" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="party-search" />
        </div>
        <Segmented
          value={archived ? 'archived' : 'active'}
          onChange={(v) => {
            // Clear the list while the other one loads, so no row of the old list (with its buttons) is shown.
            setRows(null);
            setArchived(v === 'archived');
          }}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'archived', label: 'Archived' },
          ]}
          testId="party-archived"
        />
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty
            icon={mod.icon}
            title={search ? 'Nothing found' : archived ? `No archived ${mod.label.toLowerCase()}` : `No ${mod.label.toLowerCase()} yet`}
            message={archived ? 'Deleted ones that are on documents are kept here.' : `Tap + to add one, or save it while creating a document.`}
          />
        ) : (
          <div className="list" data-testid="party-list">
            {rows.map((p) => (
              <div key={p.id} className="list-item" data-testid="party-row">
                <span className="avatar">{(p.name || '?').slice(0, 1).toUpperCase()}</span>
                <button type="button" className="list-main plain" onClick={() => !archived && go(`/party/${p.id}`)} data-testid="party-open">
                  <strong>
                    {p.name}
                    <span className="pill" data-testid="party-kind-badge">{p.kind === 'both' ? 'Both' : p.kind === 'vendor' ? 'Vendor' : 'Customer'}</span>
                  </strong>
                  <span className="small muted">{[p.phone, p.gstin || p.tax_id, p.state].filter(Boolean).join(' · ') || '—'}</span>
                  <span className="small muted">
                    {p.document_count || 0} document(s){p.last_document_date ? ` · last ${formatDate(p.last_document_date, settings.dateFormat)}` : ''}
                  </span>
                </button>
                {archived ? (
                  <button type="button" className="btn btn-sm" onClick={() => restore(p)} data-testid="party-restore">
                    Restore
                  </button>
                ) : (
                  withLedger && (
                  <span className="list-end">
                    <strong className={`party-balance ${Number(p.balance) > 0 ? 'get' : Number(p.balance) < 0 ? 'give' : ''}`} data-testid="party-balance-cell">
                      {money(abs(p.balance))}
                    </strong>
                    <span className="small muted">{balanceLabel(p.balance)}</span>
                  </span>
                  )
                )}
                {!archived && (
                  <button type="button" className="icon-btn sm" onClick={() => setEditing({ ...emptyParty(newKind), ...p })} aria-label={`Edit ${p.name}`} data-testid="party-edit">
                    <Icon name="edit" size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {!archived && (
        <button className="fab no-print" onClick={() => setEditing(emptyParty(newKind))} aria-label={`Add ${mod.singular}`} data-testid="add-party">
          <Icon name="plus" size={26} />
        </button>
      )}
      {editing && (
        <PartySheet
          initial={editing}
          taxSystem={settings.taxSystem}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onDelete={remove}
        />
      )}
    </>
  );
}
