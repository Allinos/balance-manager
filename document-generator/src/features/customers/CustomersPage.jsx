import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import SearchSelect from '../../components/SearchSelect.jsx';
import { EmptyState, PageHeader } from '../../components/Common.jsx';
import { Field, TextArea, TextInput } from '../../components/Form.jsx';
import { STATE_NAMES, isValidGstin, stateCode, stateFromGstin } from '../../config/states.js';
import { deleteParty, listParties, saveParty } from '../../services/catalogService.js';
import { useConfirm, useToast } from '../../hooks/useUi.jsx';

const BLANK = { name: '', company_name: '', phone: '', email: '', address: '', shipping_address: '', state: '', gstin: '', tax_id: '' };
const stateOptions = STATE_NAMES.map((s) => ({ value: s, label: s, hint: stateCode(s) }));

function PartyForm({ party, onClose, onSaved }) {
  const toast = useToast();
  const [p, setP] = useState(party);
  const set = (patch) => setP((x) => ({ ...x, ...patch }));
  const gstinProblem = p.gstin && !isValidGstin(p.gstin) ? 'This does not look like a valid 15-character GSTIN.' : '';

  const setGstin = (v) => {
    const gstin = v.toUpperCase().replace(/\s/g, '');
    const fromGstin = stateFromGstin(gstin);
    set({ gstin, ...(fromGstin && !p.state ? { state: fromGstin } : {}) });
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      await saveParty(p);
      onSaved();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <Modal title={p.id ? `Edit ${p.name}` : 'Add customer / vendor'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="grid-2">
          <Field label="Name" required>
            <TextInput value={p.name} onChange={(v) => set({ name: v })} autoFocus data-testid="party-name" />
          </Field>
          <Field label="Company">
            <TextInput value={p.company_name} onChange={(v) => set({ company_name: v })} />
          </Field>
          <Field label="Phone">
            <TextInput value={p.phone} onChange={(v) => set({ phone: v })} />
          </Field>
          <Field label="Email">
            <TextInput value={p.email} onChange={(v) => set({ email: v })} type="email" />
          </Field>
          <Field label="GSTIN" hint={gstinProblem}>
            <TextInput value={p.gstin} onChange={setGstin} maxLength={15} placeholder="e.g. 27AAPFU0939F1ZV" />
          </Field>
          <Field label="State">
            <SearchSelect value={p.state} onChange={(v) => set({ state: v || '' })} options={stateOptions} placeholder="Choose state" creatable clearable recentKey="states" testId="party-state" />
          </Field>
          <Field label="Billing address" className="span-2">
            <TextArea rows={2} value={p.address} onChange={(v) => set({ address: v })} />
          </Field>
          <Field label="Shipping address" hint="Leave empty if same as billing" className="span-2">
            <TextArea rows={2} value={p.shipping_address} onChange={(v) => set({ shipping_address: v })} />
          </Field>
          <Field label="Other tax ID">
            <TextInput value={p.tax_id} onChange={(v) => set({ tax_id: v })} />
          </Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!p.name.trim()} data-testid="party-save">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Saved customers and vendors (the same list is offered on every document). */
export default function CustomersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const load = () => listParties(search).then(setRows).catch((e) => toast.error(e.message));
  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const remove = async (p) => {
    const ok = await confirm({
      title: `Delete ${p.name}?`,
      message: 'Documents already created for this customer are not changed.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteParty(p.id);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Customers & Vendors"
        subtitle="Saved automatically when you tick “Save this customer” on a document. Choose them from the list when creating documents."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing(BLANK)} data-testid="add-party">
            <Icon name="plus" /> Add
          </button>
        }
      />
      <div className="card">
        <div className="toolbar">
          <div className="search-box">
            <Icon name="search" size={16} />
            <input className="input" placeholder="Search by name, company, phone or GSTIN…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="party-search" />
          </div>
          {rows && <span className="muted small">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</span>}
        </div>
        {rows && rows.length === 0 ? (
          <EmptyState
            icon="users"
            title={search ? 'No matches' : 'No saved customers yet'}
            message={search ? 'Try a different search.' : 'Add your regular customers and suppliers to fill documents faster.'}
          />
        ) : (
          <div className="table-wrap">
            <table className="table compact" data-testid="parties-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th className="hide-sm">Email</th>
                  <th>GSTIN</th>
                  <th className="hide-sm">State</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(rows || []).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      {p.company_name && <div className="muted small">{p.company_name}</div>}
                    </td>
                    <td>{p.phone}</td>
                    <td className="hide-sm">{p.email}</td>
                    <td className="mono">{p.gstin}</td>
                    <td className="hide-sm">{p.state}</td>
                    <td className="actions-col">
                      <div className="row-actions">
                        <button className="icon-btn" onClick={() => setEditing({ ...BLANK, ...p })} title="Edit">
                          <Icon name="edit" size={16} />
                        </button>
                        <button className="icon-btn danger" onClick={() => remove(p)} title="Delete">
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && (
        <PartyForm
          party={editing}
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
