import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi, date, dateTime, qs, validity } from '../../api.js';
import { Badge, CopyButton, Empty, ErrorText, Field, Input, Modal, Pagination, Select, Spinner, useLoad, useToast } from '../../components/ui.jsx';
import { NewLicenseModal } from './AdminClients.jsx';

export function LicenseEditor({ id, onClose }) {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => adminApi.get(`/licenses/${id}`), [id]);
  const [days, setDays] = useState('365');
  const [edit, setEdit] = useState(null);

  const run = async (fn, message) => {
    try {
      await fn();
      toast(message);
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  if (loading) return <Modal title="License" onClose={onClose}><Spinner /></Modal>;
  if (error) return <Modal title="License" onClose={onClose}><ErrorText error={error} /></Modal>;
  const l = data.license;
  const form = edit || {
    status: l.storedStatus,
    expiresAt: l.expiresAt ? l.expiresAt.slice(0, 10) : '',
    maxDevices: String(l.maxDevices),
    notes: l.notes,
  };
  return (
    <Modal title={`License ${l.code}`} onClose={onClose} wide>
      <div className="row between">
        <div className="row">
          <span className="code">{l.code}</span>
          <CopyButton text={l.code} />
          <Badge status={l.status} />
        </div>
        <span className="muted">{l.planName}</span>
      </div>
      <dl className="kv kv-3">
        <dt>Client</dt>
        <dd>{data.client ? <Link to={`/admin/clients/${data.client.id}`}>{data.client.businessName || data.client.email}</Link> : 'Not assigned'}</dd>
        <dt>Valid until</dt>
        <dd>{validity(l)}</dd>
        <dt>Activated</dt>
        <dd>{date(l.activatedAt)}</dd>
        <dt>Source</dt>
        <dd>{l.source}</dd>
      </dl>

      <div className="card inset">
        <strong>Extend validity</strong>
        <div className="row">
          <Input type="number" min="1" value={days} onChange={setDays} style={{ width: 120 }} />
          <span>days</span>
          <button className="btn btn-primary btn-sm" onClick={() => run(() => adminApi.post(`/licenses/${l.id}/extend`, { days: Number(days) }), 'License extended')} data-testid="extend-license">
            Extend
          </button>
          {!l.lifetime && (
            <button className="btn btn-sm" onClick={() => run(() => adminApi.put(`/licenses/${l.id}`, { lifetime: true }), 'Changed to lifetime')}>
              Make lifetime
            </button>
          )}
        </div>
      </div>

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              adminApi.put(`/licenses/${l.id}`, {
                status: form.status,
                maxDevices: Number(form.maxDevices),
                notes: form.notes,
                ...(form.expiresAt ? { expiresAt: new Date(`${form.expiresAt}T23:59:59`).toISOString() } : {}),
              }),
            'License updated',
          );
          setEdit(null);
        }}
      >
        <div className="grid-3">
          <Field label="Status">
            <Select value={form.status} onChange={(v) => setEdit({ ...form, status: v })} options={['unused', 'active', 'suspended', 'revoked']} />
          </Field>
          <Field label="Expiry date">
            <Input type="date" value={form.expiresAt} onChange={(v) => setEdit({ ...form, expiresAt: v })} />
          </Field>
          <Field label="Computers allowed">
            <Input type="number" min="1" value={form.maxDevices} onChange={(v) => setEdit({ ...form, maxDevices: v })} />
          </Field>
          <Field label="Notes" span>
            <Input value={form.notes} onChange={(v) => setEdit({ ...form, notes: v })} />
          </Field>
        </div>
        <div className="row end">
          <button className="btn btn-primary" disabled={!edit}>
            Save changes
          </button>
        </div>
      </form>

      <h3>Computers</h3>
      {!data.devices.length ? (
        <p className="muted">Not activated on any computer yet.</p>
      ) : (
        <table className="table compact">
          <thead>
            <tr>
              <th>Computer</th>
              <th>Platform / version</th>
              <th>Activated</th>
              <th>Last seen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.devices.map((d) => (
              <tr key={d.id}>
                <td>{d.device_name || d.device_id.slice(0, 12)}</td>
                <td>
                  {d.platform} {d.app_version}
                </td>
                <td>{dateTime(d.activated_at)}</td>
                <td>{d.released_at ? <Badge status="inactive">released</Badge> : dateTime(d.last_seen_at)}</td>
                <td className="right">
                  {!d.released_at && (
                    <button className="btn btn-sm" onClick={() => run(() => adminApi.post(`/licenses/${l.id}/devices/${d.id}/release`), 'Computer released')}>
                      Release
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>History</h3>
      <ul className="history">
        {data.history.map((h) => (
          <li key={h.id}>
            <span className="muted">{dateTime(h.created_at)}</span> {h.action} <span className="muted small">{h.actor_type}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export default function AdminLicenses() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const status = params.get('status') || '';
  const page = Number(params.get('page') || 1);
  const { data, loading, error, reload } = useLoad(() => adminApi.get(`/licenses${qs({ q: params.get('q') || '', status, page, pageSize: 25 })}`), [params.toString()]);
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [open, setOpen] = useState(null);

  return (
    <>
      <div className="page-head">
        <h1>Licenses &amp; activation codes</h1>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          Create licenses / codes
        </button>
      </div>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ q, status });
        }}
      >
        <input className="input" placeholder="Search code, client email or business" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={status} onChange={(e) => setParams({ q, status: e.target.value })}>
          <option value="">All statuses</option>
          {['unused', 'active', 'expired', 'suspended', 'revoked'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="btn">Search</button>
      </form>
      <ErrorText error={error} />
      {loading ? (
        <Spinner />
      ) : !data?.rows.length ? (
        <Empty>No licenses found.</Empty>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Client</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Valid until</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((l) => (
                <tr key={l.id} className="clickable" onClick={() => setOpen(l.id)}>
                  <td className="mono">{l.code}</td>
                  <td>{l.client ? l.client.businessName || l.client.email : <span className="muted">Unassigned</span>}</td>
                  <td>{l.planName}</td>
                  <td>
                    <Badge status={l.status} />
                  </td>
                  <td>{validity(l)}</td>
                  <td>{date(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination {...data} onPage={(p) => setParams({ q, status, page: String(p) })} />
        </div>
      )}
      {creating && (
        <NewLicenseModal
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      {open && (
        <LicenseEditor
          id={open}
          onClose={() => {
            setOpen(null);
            reload();
          }}
        />
      )}
    </>
  );
}
