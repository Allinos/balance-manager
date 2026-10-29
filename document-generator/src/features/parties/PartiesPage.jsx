import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import { EmptyState, PageHeader, Spinner } from '../../components/Common.jsx';
import SearchSelect from '../../components/SearchSelect.jsx';
import { Field, Segmented, TextArea, TextInput, Toggle } from '../../components/Form.jsx';
import { STATE_NAMES, isValidGstin, stateCode, stateFromGstin } from '../../config/states.js';
import { PARTY_FEATURE, PARTY_KIND_OPTIONS, enabledModules, partyFeatureOn, partyFeatureValue } from '../../config/partyModules.js';
import { archiveParty, deleteParty, queryParties, saveParty } from '../../services/catalogService.js';
import { balanceLabel, ledgerSummary } from '../../services/ledgerService.js';
import { abs } from '../../utils/decimal.js';
import { useMoney } from '../../hooks/useMoney.js';
import { formatDate } from '../../utils/dates.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useConfirm, useToast } from '../../hooks/useUi.jsx';
import { useDebounced } from '../../hooks/useShortcuts.js';
import { Link, useRouter } from '../../router/router.jsx';

const stateOptions = STATE_NAMES.map((s) => ({ value: s, label: s, hint: stateCode(s) }));

const emptyParty = (kind) => ({
  name: '',
  company_name: '',
  phone: '',
  email: '',
  gstin: '',
  tax_id: '',
  state: '',
  address: '',
  shipping_address: '',
  kind,
  notes: '',
});

/** Add / edit one customer or vendor. */
export function PartyForm({ initial, taxSystem, onClose, onSaved }) {
  const toast = useToast();
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
    if (!p.name.trim()) return toast.error(`Please enter the ${noun} name.`);
    if (p.gstin && !isValidGstin(p.gstin)) return toast.error(`The GSTIN "${p.gstin}" is not valid. It has 15 characters, e.g. 27AAPFU0939F1ZV.`);
    if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) return toast.error('Please check the email address.');
    setSaving(true);
    try {
      const fields = ['id', 'name', 'company_name', 'phone', 'email', 'gstin', 'tax_id', 'state', 'address', 'shipping_address', 'kind', 'notes'];
      const data = Object.fromEntries(fields.filter((k) => p[k] !== undefined).map((k) => [k, typeof p[k] === 'string' ? p[k].trim() : p[k]]));
      const id = await saveParty(data);
      toast.success(`${p.name.trim()} saved`);
      onSaved(id);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <Modal title={p.id ? `Edit ${p.name}` : `Add ${noun}`} onClose={onClose} size="lg">
      <form onSubmit={submit} className="form" data-keynav data-testid="party-form">
        <Field label="Saved as" help="A customer appears on sales documents, a vendor on purchase documents. Choose Both if you buy from and sell to them.">
          <Segmented value={p.kind} onChange={(kind) => set({ kind })} options={PARTY_KIND_OPTIONS} testId="party-kind" />
        </Field>
        <div className="grid-2">
          <Field label="Name" required>
            <TextInput value={p.name} onChange={(v) => set({ name: v })} placeholder={noun === 'vendor' ? 'e.g. Sri Balaji Timbers' : 'e.g. Mehta Interiors Pvt Ltd'} maxLength={120} autoFocus data-testid="party-form-name" />
          </Field>
          <Field label="Contact person / company">
            <TextInput value={p.company_name} onChange={(v) => set({ company_name: v })} placeholder="e.g. Rahul Mehta" maxLength={120} />
          </Field>
          <Field label="Phone">
            <TextInput type="tel" value={p.phone} onChange={(v) => set({ phone: v })} placeholder="e.g. +91 98450 12345" maxLength={40} data-testid="party-form-phone" />
          </Field>
          <Field label="Email">
            <TextInput type="email" value={p.email} onChange={(v) => set({ email: v })} placeholder="e.g. accounts@mehtainteriors.in" maxLength={120} />
          </Field>
          {taxSystem === 'GST' ? (
            <Field label="GSTIN" help="15 characters. The state is filled in from it.">
              <TextInput value={p.gstin} onChange={onGstin} placeholder="e.g. 29ABCDE1234F1Z5" maxLength={15} data-testid="party-form-gstin" />
            </Field>
          ) : (
            <Field label="Tax ID / VAT number">
              <TextInput value={p.tax_id} onChange={(v) => set({ tax_id: v })} placeholder="e.g. 100123456700003" maxLength={40} />
            </Field>
          )}
          <Field label="State">
            <SearchSelect value={p.state} onChange={(v) => set({ state: v || '' })} options={stateOptions} placeholder="Choose state" creatable clearable recentKey="states" testId="party-form-state" />
          </Field>
          <Field label="Billing address">
            <TextArea rows={3} value={p.address} onChange={(v) => set({ address: v })} placeholder={'Building, street, area\nCity – PIN code'} />
          </Field>
          <Field label="Shipping address" hint="Only if goods go to a different address">
            <TextArea rows={3} value={p.shipping_address} onChange={(v) => set({ shipping_address: v })} placeholder="Leave empty if same as billing address" />
          </Field>
        </div>
        <Field label="Notes (not printed)">
          <TextArea rows={2} value={p.notes} onChange={(v) => set({ notes: v })} placeholder="e.g. Prefers delivery after 2 pm; credit period 30 days" maxLength={500} />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving} data-testid="party-form-save">
            <Icon name="save" /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The Customers & Vendors feature switch (Settings → Features, and the page behind + Add More). */
export function PartyModuleSwitches() {
  const { settings, updateSettings } = useAppData();
  const toast = useToast();
  // Shown switched at once; saved in the background.
  const [shown, setShown] = useState(null);
  const on = shown ?? partyFeatureOn(settings);
  const toggle = async (next) => {
    setShown(next);
    try {
      await updateSettings(partyFeatureValue(next));
      toast.success(`Customers & Vendors ${next ? 'switched on — find them in the sidebar' : 'switched off. Your saved records are kept.'}`);
    } catch (e) {
      setShown(!next);
      toast.error(e.message);
    }
  };
  return (
    <div className="module-cards">
      <div className={`module-card ${on ? 'on' : ''}`} data-testid="module-parties">
        <span className="module-icon">
          <Icon name={PARTY_FEATURE.icon} size={22} />
        </span>
        <div className="module-text">
          <strong>{PARTY_FEATURE.label}</strong>
          <span className="muted small">{PARTY_FEATURE.description}</span>
          {on && (
            <Link to="/parties/all" className="link small" data-testid="open-parties">
              Open Customers &amp; Vendors →
            </Link>
          )}
        </div>
        <Toggle checked={on} onChange={toggle} label="" aria-label="Customers & Vendors feature" data-testid="module-parties-toggle" />
      </div>
    </div>
  );
}

/** Settings → Features. */
export function PartyModuleSettings() {
  return (
    <div className="settings-section">
      <h2>Features</h2>
      <p className="muted">
        Optional features, off until you switch them on. Typing a name in a
        document still offers saved customers and vendors either way.
      </p>
      <PartyModuleSwitches />
      <p className="muted small">
        Deleting a customer or vendor never changes your documents: one that appears on an invoice, receipt or any other document is archived instead
        (hidden from lists, restorable at any time), and every document keeps the details printed on it.
      </p>
    </div>
  );
}

/** /parties: where + Add More leads — switch the modules on and open them. */
export function PartyModulesPage() {
  const { settings } = useAppData();
  const on = enabledModules(settings);
  return (
    <div className="page narrow">
      <PageHeader title="Features" subtitle="Switch on the features you need. They appear in the sidebar under Products & Services." />
      <div className="card card-pad">
        <PartyModuleSwitches />
      </div>
      {on.length === 0 && <p className="muted small center">Customers & Vendors is off. Documents still remember the customers and vendors you type in.</p>}
    </div>
  );
}

/** Customers and vendors together on one screen: All, Customers or Vendors. */
const ALL = { kind: 'all', label: 'Customers & Vendors', singular: 'customer or vendor', icon: 'users' };

/** /parties/all, /parties/customer and /parties/vendor: one screen to list, search, add, edit, archive / restore. */
export default function PartiesPage({ params }) {
  const { settings } = useAppData();
  const { navigate } = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const tabs = enabledModules(settings);
  const mod = tabs.find((m) => m.kind === params.kind) || (tabs.length === 1 ? tabs[0] : ALL);
  const enabled = tabs.length > 0;
  // A new record starts as the kind being looked at (a customer on All).
  const newKind = mod.kind === 'all' ? 'customer' : mod.kind;
  const [rows, setRows] = useState(null);
  const [totals, setTotals] = useState(null);
  const loadTicket = useRef(0);
  const money = useMoney();
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState(null);
  const debounced = useDebounced(search, 200);

  const load = useCallback(async () => {
    try {
      const ticket = ++loadTicket.current;
      const list = await queryParties({ kind: mod.kind === 'all' ? '' : mod.kind, archived, search: debounced });
      // Balances from the ledger (invoices, bills and payments of each party).
      const summary = await ledgerSummary(list);
      // Only the latest request counts (switching Active / Archived quickly must not show an older list).
      if (ticket !== loadTicket.current) return;
      setRows(summary.parties);
      setTotals(summary.totals);
    } catch (e) {
      toast.error(e.message);
    }
  }, [mod.kind, archived, debounced, toast]);

  useEffect(() => {
    if (enabled) load();
  }, [load, enabled]);

  if (!enabled) return <PartyModulesPage />;

  const remove = async (p) => {
    const used = Number(p.document_count) > 0;
    const ok = await confirm({
      title: `Delete ${p.name}?`,
      message: used
        ? `${p.name} appears on ${p.document_count} document(s), so it will be archived: hidden from this list and from suggestions, while every document keeps its details. You can restore it from Archived.`
        : `${p.name} is not on any document and will be deleted.`,
      confirmText: used ? 'Archive' : 'Delete',
      danger: !used,
    });
    if (!ok) return;
    try {
      const result = await deleteParty(p.id);
      toast.success(result === 'archived' ? `${p.name} archived — documents unchanged` : `${p.name} deleted`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const restore = async (p) => {
    try {
      await archiveParty(p.id, false);
      toast.success(`${p.name} restored`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };
  return (
    <div className="page" data-testid={`parties-${mod.kind}`}>
      <PageHeader
        title="Customers & Vendors"
        subtitle="Everyone you sell to and buy from, in one place. Documents always keep the details printed on them."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing(emptyParty(newKind))} data-testid="add-party">
            <Icon name="plus" /> Add {mod.singular}
          </button>
        }
      />
      {totals && !archived && (
        <div className="ledger-cards" data-testid="ledger-totals">
          <div className="ledger-card get">
            <small>{"You'll get (receivables)"}</small>
            <strong data-testid="total-receivable">{money(totals.receivable)}</strong>
          </div>
          <div className="ledger-card give">
            <small>{"You'll give (payables)"}</small>
            <strong data-testid="total-payable">{money(totals.payable)}</strong>
          </div>
          <div className="ledger-card">
            <small>Advances received</small>
            <strong data-testid="total-advance-received">{money(totals.advanceReceived)}</strong>
          </div>
          <div className="ledger-card">
            <small>Advances paid</small>
            <strong data-testid="total-advance-paid">{money(totals.advancePaid)}</strong>
          </div>
        </div>
      )}
      <div className="toolbar card">
        {tabs.length > 1 && (
          <Segmented
            value={mod.kind}
            onChange={(k) => navigate(`/parties/${k}`)}
            options={[{ value: 'all', label: 'All' }, ...tabs.map((m) => ({ value: m.kind, label: m.label }))]}
            testId="party-tabs"
          />
        )}
        <div className="search">
          <Icon name="search" />
          <input
            className="input"
            placeholder={`Search ${mod.label.toLowerCase()} by name, phone, email or GSTIN…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="party-search"
          />
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
      </div>
      <div className="card table-card">
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={mod.icon}
            title={search ? 'Nothing found' : archived ? `No archived ${mod.label.toLowerCase()}` : `No ${mod.label.toLowerCase()} yet`}
            message={
              archived
                ? `${mod.label} you delete while they are on documents are kept here.`
                : `Add your ${mod.label.toLowerCase()} here, or tick "Save this ${mod.singular} for next time" when you create a document.`
            }
            action={
              !archived && (
                <button className="btn btn-primary" onClick={() => setEditing(emptyParty(newKind))}>
                  <Icon name="plus" /> Add {mod.singular}
                </button>
              )
            }
          />
        ) : (
          <table className="table" data-testid="party-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>{settings.taxSystem === 'GST' ? 'GSTIN' : 'Tax ID'}</th>
                <th>State</th>
                <th className="num">Documents</th>
                <th>Last document</th>
                <th className="num">Balance</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} onDoubleClick={() => !archived && setEditing({ ...emptyParty(newKind), ...p })} data-testid="party-row">
                  <td>
                    <Link to={`/party/${p.id}`} data-testid="party-open">
                      <strong>{p.name}</strong>
                    </Link>
                    <span className={`badge party-kind-${p.kind}`} data-testid="party-kind-badge">
                      {p.kind === 'both' ? 'Customer & vendor' : p.kind === 'vendor' ? 'Vendor' : 'Customer'}
                    </span>
                    {p.is_demo ? <span className="badge badge-demo">Sample</span> : null}
                    {p.company_name && p.company_name !== p.name && <div className="muted small">{p.company_name}</div>}
                  </td>
                  <td>
                    {p.phone || '—'}
                    {p.email && <div className="muted small">{p.email}</div>}
                  </td>
                  <td>{(settings.taxSystem === 'GST' ? p.gstin : p.tax_id) || '—'}</td>
                  <td>{p.state || '—'}</td>
                  <td className="num">{p.document_count || 0}</td>
                  <td>{p.last_document_date ? formatDate(p.last_document_date, settings.dateFormat) : '—'}</td>
                  <td className="num">
                    <span className={`party-balance ${Number(p.balance) > 0 ? 'get' : Number(p.balance) < 0 ? 'give' : ''}`} data-testid="party-balance-cell">
                      {money(abs(p.balance))}
                      <small>{balanceLabel(p.balance)}</small>
                    </span>
                  </td>
                  <td className="actions-col">
                    <div className="row-actions">
                      {archived ? (
                        <button className="btn btn-sm" onClick={() => restore(p)} data-testid="party-restore">
                          <Icon name="undo" size={15} /> Restore
                        </button>
                      ) : (
                        <>
                          <button className="icon-btn" title="Ledger & payments" onClick={() => navigate(`/party/${p.id}`)} data-testid="party-ledger-open">
                            <Icon name="book" size={17} />
                          </button>
                          <button className="icon-btn" title="Edit" onClick={() => setEditing({ ...emptyParty(newKind), ...p })} data-testid="party-edit">
                            <Icon name="edit" size={17} />
                          </button>
                          <button className="icon-btn danger" title="Delete" onClick={() => remove(p)} data-testid="party-delete">
                            <Icon name="trash" size={17} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && (
        <PartyForm
          initial={editing}
          taxSystem={settings.taxSystem}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
