import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import { Field, Segmented, Select, TextArea, TextInput } from '../../components/Form.jsx';
import { DATE_FORMATS } from '../../utils/dates.js';
import { deleteParty, listParties, saveParty } from '../../services/catalogService.js';
import { exportBackup, restoreBackup } from '../../services/systemService.js';
import { loadDemoData, removeDemoData } from '../../services/demoService.js';
import { useAppData, useDocContext } from '../../hooks/useAppData.jsx';
import { useConfirm, useToast } from '../../hooks/useUi.jsx';
import { SaveBar, useSettingsDraft } from './SettingsParts.jsx';

export function GeneralSettings() {
  const { draft, set, dirty, save } = useSettingsDraft(['dateFormat']);
  const ctx = useDocContext();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const addDemo = async () => {
    setBusy(true);
    try {
      await loadDemoData(ctx);
      toast.success('Sample data added. Look for items marked "Sample".');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const clearDemo = async () => {
    const ok = await confirm({
      title: 'Remove sample data?',
      message: 'All sample documents, products and customers will be deleted. Your own data is not affected.',
      confirmText: 'Remove sample data',
      danger: true,
    });
    if (!ok) return;
    try {
      await removeDemoData();
      toast.success('Sample data removed');
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="settings-section">
      <h2>General</h2>
      <Field label="Date format">
        <Select value={draft.dateFormat} onChange={(v) => set({ dateFormat: v })} options={DATE_FORMATS} />
      </Field>
      <SaveBar dirty={dirty} onSave={save} />

      <h3>Sample data</h3>
      <p className="muted">Add a sample customer, products, an invoice and a quotation to explore DocGen. Sample records are clearly marked and can be removed at any time.</p>
      <div className="row gap">
        <button className="btn" onClick={addDemo} disabled={busy}>
          <Icon name="sparkle" /> Load sample data
        </button>
        <button className="btn btn-danger-outline" onClick={clearDemo}>
          <Icon name="trash" /> Remove sample data
        </button>
      </div>
    </div>
  );
}

export function AppearanceSettings() {
  const { draft, set, dirty, save } = useSettingsDraft(['theme']);
  return (
    <div className="settings-section">
      <h2>Appearance</h2>
      <p className="muted">The application theme does not affect printed documents. Document style is set under Documents.</p>
      <Field label="Theme">
        <Segmented
          value={draft.theme}
          onChange={(v) => set({ theme: v })}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ]}
        />
      </Field>
      <SaveBar dirty={dirty} onSave={save} />
    </div>
  );
}

function PartyForm({ party, onClose, onSaved }) {
  const toast = useToast();
  const [p, setP] = useState(party);
  const set = (patch) => setP((x) => ({ ...x, ...patch }));
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
            <TextInput value={p.name} onChange={(v) => set({ name: v })} autoFocus />
          </Field>
          <Field label="Company">
            <TextInput value={p.company_name} onChange={(v) => set({ company_name: v })} />
          </Field>
          <Field label="Phone">
            <TextInput value={p.phone} onChange={(v) => set({ phone: v })} />
          </Field>
          <Field label="Email">
            <TextInput value={p.email} onChange={(v) => set({ email: v })} />
          </Field>
          <Field label="Address" className="span-2">
            <TextArea rows={2} value={p.address} onChange={(v) => set({ address: v })} />
          </Field>
          <Field label="State">
            <TextInput value={p.state} onChange={(v) => set({ state: v })} />
          </Field>
          <Field label="GSTIN">
            <TextInput value={p.gstin} onChange={(v) => set({ gstin: v.toUpperCase() })} />
          </Field>
          <Field label="Other tax ID">
            <TextInput value={p.tax_id} onChange={(v) => set({ tax_id: v })} />
          </Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CustomerSettings() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const load = () => listParties(search).then(setRows).catch((e) => toast.error(e.message));
  useEffect(() => {
    load();
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

  const blank = { name: '', company_name: '', phone: '', email: '', address: '', shipping_address: '', state: '', gstin: '', tax_id: '' };

  return (
    <div className="settings-section">
      <h2>Saved customers &amp; vendors</h2>
      <p className="muted">Saved when you tick &quot;Save this customer&quot; on a document. Not required — you can always type details directly.</p>
      <div className="inline-form">
        <input className="input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn" onClick={() => setEditing(blank)}>
          <Icon name="plus" /> Add
        </button>
      </div>
      <table className="table compact">
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Email</th>
            <th>GSTIN</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>
                <strong>{p.name}</strong>
                {p.company_name && <div className="muted small">{p.company_name}</div>}
              </td>
              <td>{p.phone}</td>
              <td>{p.email}</td>
              <td>{p.gstin}</td>
              <td className="actions-col">
                <div className="row-actions">
                  <button className="icon-btn" onClick={() => setEditing(p)} title="Edit">
                    <Icon name="edit" size={16} />
                  </button>
                  <button className="icon-btn danger" onClick={() => remove(p)} title="Delete">
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted center">
                No saved customers yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
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

export function BackupSettings() {
  const { reload, info } = useAppData();
  const toast = useToast();
  const confirm = useConfirm();

  const doExport = async () => {
    try {
      const path = await exportBackup();
      if (path) toast.success(`Backup saved to ${path}`);
    } catch (e) {
      toast.error(e.message);
    }
  };
  const doRestore = async () => {
    const ok = await confirm({
      title: 'Restore from a backup?',
      message:
        'All current data (documents, products, customers and settings) will be replaced by the backup. A safety copy of your current data is saved automatically first.',
      confirmText: 'Choose backup file…',
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await restoreBackup();
      if (result) {
        toast.success('Backup restored');
        await reload();
      }
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="settings-section">
      <h2>Backup &amp; restore</h2>
      <p className="muted">
        All your data lives in one file on this computer. Export a backup regularly and keep it on a USB drive or cloud folder.
      </p>
      <div className="backup-cards">
        <div className="backup-card">
          <Icon name="download" size={22} />
          <h3>Export backup</h3>
          <p className="muted small">Saves documents, products, customers, settings, logo and signatures into one .docgen file.</p>
          <button className="btn btn-primary" onClick={doExport}>
            Export Backup
          </button>
        </div>
        <div className="backup-card">
          <Icon name="upload" size={22} />
          <h3>Import backup</h3>
          <p className="muted small">Replaces current data with a backup. Your current data is saved first as a safety copy.</p>
          <button className="btn" onClick={doRestore}>
            Import Backup
          </button>
        </div>
      </div>
      {info?.dataFile && (
        <p className="muted small">
          Data file: <span className="mono">{info.dataFile}</span>
        </p>
      )}
    </div>
  );
}

export function AboutSettings() {
  const { info } = useAppData();
  return (
    <div className="settings-section">
      <h2>About DocGen</h2>
      <dl className="about-list">
        <dt>Version</dt>
        <dd>{info?.version}</dd>
        <dt>Platform</dt>
        <dd>{info?.platform}</dd>
        <dt>Data file</dt>
        <dd className="mono">{info?.dataFile}</dd>
      </dl>
      <h3>Privacy</h3>
      <p className="muted">
        DocGen works fully offline. Your documents, customers, products and company details are stored only on this computer
        and are never uploaded. The only internet request DocGen makes is an occasional download of a small advertisement
        configuration file{info?.remoteConfigured ? '' : ' (not configured in this build)'}, which contains no information
        about you or your business.
      </p>
      <h3>Keyboard shortcuts</h3>
      <dl className="about-list">
        <dt>Ctrl/Cmd + N</dt>
        <dd>New document</dd>
        <dt>Ctrl/Cmd + S</dt>
        <dd>Save document</dd>
        <dt>Ctrl/Cmd + P</dt>
        <dd>Print document</dd>
        <dt>Ctrl/Cmd + F</dt>
        <dd>Search created documents</dd>
        <dt>Esc</dt>
        <dd>Close dialog</dd>
      </dl>
    </div>
  );
}
