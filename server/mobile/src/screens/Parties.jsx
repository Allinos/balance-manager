/**
 * Customers & Vendors (optional, off by default — as on the desktop):
 *   /parties           switch the modules on or off
 *   /parties/customer  list · search · add · edit · delete (archived when on documents) · restore
 *   /parties/vendor
 */

import { useCallback, useEffect, useState } from 'react';
import { STATE_NAMES, isValidGstin, stateCode, stateFromGstin } from '@desktop/config/states.js';
import { PARTY_FEATURE, PARTY_KIND_OPTIONS, PARTY_MODULES, enabledModules, moduleFor, partyFeatureOn, partyFeatureValue } from '@desktop/config/partyModules.js';
import { archiveParty, deleteParty, queryParties, saveParty } from '@desktop/services/catalogService.js';
import { formatDate } from '@desktop/utils/dates.js';
import Icon from '../components/Icon.jsx';
import { Empty, Field, Header, Input, Picker, Segmented, Sheet, Spinner, TextArea, Toggle, back, go, useUi } from '../components/ui.jsx';
import { useApp } from '../data.jsx';

const stateOptions = STATE_NAMES.map((s) => ({ value: s, label: s, hint: stateCode(s) }));
const emptyParty = (kind) => ({ name: '', company_name: '', phone: '', email: '', gstin: '', tax_id: '', state: '', address: '', shipping_address: '', kind, notes: '' });

function PartySheet({ initial, taxSystem, onClose, onSaved, onDelete }) {
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
        {p.id && (
          <button type="button" className="btn btn-danger btn-block" onClick={() => onDelete(p)} data-testid="party-delete">
            <Icon name="trash" size={18} /> Delete
          </button>
        )}
      </form>
    </Sheet>
  );
}

/** The Customers & Vendors feature switch (Settings → Features, and /parties). */
export function PartyModuleSwitches() {
  const { settings, updateSettings } = useApp();
  const { toast } = useUi();
  // Shown switched at once; saved in the background.
  const [shown, setShown] = useState(null);
  const on = shown ?? partyFeatureOn(settings);
  return (
    <div className="list">
      <div className="list-item module-row" data-testid="module-parties">
        <span className="avatar">
          <Icon name={PARTY_FEATURE.icon} size={19} />
        </span>
        <span className="list-main">
          <strong>{PARTY_FEATURE.label}</strong>
          <span className="small muted">{PARTY_FEATURE.description}</span>
          {on &&
            PARTY_MODULES.map((m) => (
              <button key={m.kind} type="button" className="link-btn small" onClick={() => go(`/parties/${m.kind}`)} data-testid={`open-${m.kind}`}>
                Open {m.label} →
              </button>
            ))}
        </span>
        <Toggle
          checked={on}
          onChange={async (next) => {
            setShown(next);
            try {
              await updateSettings(partyFeatureValue(next));
              toast(next ? 'Customers & Vendors switched on' : 'Customers & Vendors switched off. Saved records are kept.');
            } catch (e) {
              setShown(!next);
              toast(e.message, 'bad');
            }
          }}
          label=""
          aria-label="Customers & Vendors feature"
          data-testid="module-parties-toggle"
        />
      </div>
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

/** Quick links under Products: the switched-on modules, plus + Add More. */
export function PartyLinks() {
  const { settings } = useApp();
  const on = enabledModules(settings);
  return (
    <div className="chip-row party-links" data-testid="party-links">
      {on.map((m) => (
        <button key={m.kind} type="button" className="chip" onClick={() => go(`/parties/${m.kind}`)} data-testid={`link-${m.kind}`}>
          <Icon name={m.icon} size={16} /> {m.label}
        </button>
      ))}
      {(
        <button type="button" className="chip chip-ghost" onClick={() => go('/parties')} data-testid="nav-parties-add" aria-label="Add more features">
          <Icon name="plus" size={16} /> Add More
        </button>
      )}
    </div>
  );
}

export default function Parties({ kind }) {
  const { settings } = useApp();
  const { toast, confirm } = useUi();
  const mod = moduleFor(kind);
  const enabled = !!kind && !!settings[mod.setting];
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      setRows(await queryParties({ kind: mod.kind, archived, search }));
    } catch (e) {
      toast(e.message, 'bad');
    }
  }, [mod.kind, archived, search, toast]);
  useEffect(() => {
    if (!enabled) return undefined;
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load, enabled]);

  if (!enabled) {
    return (
      <>
        <Header title="Features" onBack={() => back('/products')} />
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
      <Header title={mod.label} onBack={() => back('/products')} />
      <div className="page" data-testid={`parties-${mod.kind}`}>
        <div className="search">
          <Icon name="search" size={18} />
          <input className="input" placeholder="Name, phone, email or GSTIN" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="party-search" />
        </div>
        <Segmented
          value={archived ? 'archived' : 'active'}
          onChange={(v) => setArchived(v === 'archived')}
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
                <button type="button" className="list-main plain" onClick={() => !archived && setEditing({ ...emptyParty(mod.kind), ...p })}>
                  <strong>
                    {p.name}
                    {p.kind === 'both' ? <span className="pill">Both</span> : null}
                  </strong>
                  <span className="small muted">{[p.phone, p.gstin || p.tax_id, p.state].filter(Boolean).join(' · ') || '—'}</span>
                  <span className="small muted">
                    {p.document_count || 0} document(s){p.last_document_date ? ` · last ${formatDate(p.last_document_date, settings.dateFormat)}` : ''}
                  </span>
                </button>
                {archived && (
                  <button type="button" className="btn btn-sm" onClick={() => restore(p)} data-testid="party-restore">
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {!archived && (
        <button className="fab no-print" onClick={() => setEditing(emptyParty(mod.kind))} aria-label={`Add ${mod.singular}`} data-testid="add-party">
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
