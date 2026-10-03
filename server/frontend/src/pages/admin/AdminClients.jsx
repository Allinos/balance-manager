import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { adminApi, date, dateTime, money, qs, validity } from '../../api.js';
import { Badge, CopyButton, Empty, ErrorText, Field, Input, Modal, Pagination, Select, Spinner, Textarea, useDialog, useLoad, useToast } from '../../components/ui.jsx';
import { BUSINESS_TYPES, STATES } from '../../constants.js';
import { LicenseEditor } from './AdminLicenses.jsx';

const blank = { name: '', email: '', phone: '', business_name: '', business_type: '', gstin: '', address: '', city: '', state: '', pin: '', password: '' };

/** "google / cpc · gst-invoice-oct" */
const signupLabel = (s) => (s?.source ? [s.source, s.medium].filter(Boolean).join(' / ') + (s.campaign ? ` · ${s.campaign}` : '') : '—');

function ClientForm({ initial, onSaved, onCancel, isNew }) {
  const toast = useToast();
  const dialog = useDialog();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm({ ...form, [k]: v });
  const submit = async (e) => {
    e.preventDefault();
    try {
      const body = { ...form };
      if (!body.password) delete body.password;
      const r = isNew ? await adminApi.post('/clients', body) : await adminApi.put(`/clients/${initial.id}`, body);
      if (r.temporaryPassword) {
        await dialog.show({ title: 'Customer added', message: 'Share this temporary password with the customer. It is shown only once.', value: r.temporaryPassword });
      }
      toast(isNew ? 'Customer added' : 'Customer updated');
      onSaved(r.client);
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form className="form" onSubmit={submit}>
      <ErrorText error={error} />
      <div className="grid-2">
        <Field label="Contact name">
          <Input value={form.name} onChange={set('name')} required />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={set('email')} required />
        </Field>
        <Field label="Business name">
          <Input value={form.business_name} onChange={set('business_name')} />
        </Field>
        <Field label="Business type">
          <Select value={form.business_type} onChange={set('business_type')} options={[{ value: '', label: '—' }, ...BUSINESS_TYPES]} />
        </Field>
        <Field label="Mobile">
          <Input value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="GSTIN">
          <Input value={form.gstin} onChange={(v) => set('gstin')(v.toUpperCase())} maxLength={15} />
        </Field>
        <Field label="State">
          <Select value={form.state} onChange={set('state')} options={[{ value: '', label: '—' }, ...STATES]} />
        </Field>
        <Field label="City">
          <Input value={form.city} onChange={set('city')} />
        </Field>
        <Field label="Address" span>
          <Textarea rows={2} value={form.address} onChange={set('address')} />
        </Field>
        {isNew && (
          <Field label="Password (optional)" hint="Leave empty to generate a temporary password">
            <Input type="text" value={form.password} onChange={set('password')} minLength={8} />
          </Field>
        )}
        {!isNew && (
          <Field label="Status">
            <Select value={form.status} onChange={set('status')} options={['active', 'suspended']} />
          </Field>
        )}
      </div>
      <div className="row end">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary">Save</button>
      </div>
    </form>
  );
}

export default function AdminClients() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(params.get('q') || '');
  const page = Number(params.get('page') || 1);
  const status = params.get('status') || '';
  const { data, loading, error, reload } = useLoad(() => adminApi.get(`/clients${qs({ q: params.get('q') || '', status, page, pageSize: 25 })}`), [params.toString()]);
  const [creating, setCreating] = useState(params.get('new') === '1');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Customers</h1>
          <p className="muted">Everyone who bought DocGen or started a checkout.</p>
        </div>
        <button className="btn" onClick={() => setCreating(true)}>
          Add customer
        </button>
      </div>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ q, status });
        }}
      >
        <input className="input" placeholder="Search name, email, mobile, business" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={status} onChange={(e) => setParams({ q, status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button className="btn">Search</button>
      </form>
      <ErrorText error={error} />
      {loading ? (
        <Spinner />
      ) : !data?.rows.length ? (
        <Empty>No customers found.</Empty>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>License</th>
                <th>Valid until</th>
                <th className="right">Paid</th>
                <th>Came from</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => navigate(`/admin/clients/${c.id}`)}>
                  <td>
                    <strong>{c.name}</strong> {c.status !== 'active' && <Badge status={c.status} />}
                    <div className="muted small">
                      {c.email}
                      {c.phone && ` · ${c.phone}`}
                    </div>
                  </td>
                  <td>
                    {c.license ? (
                      <>
                        <Badge status={c.license.status} />
                        <div className="muted small mono">{c.license.code}</div>
                      </>
                    ) : (
                      <span className="muted small">Not bought</span>
                    )}
                  </td>
                  <td>{c.license ? (c.license.lifetime ? 'Lifetime' : date(c.license.expiresAt)) : '—'}</td>
                  <td className="right">{c.paidTotal ? money(c.paidTotal) : '—'}</td>
                  <td className="small">{signupLabel(c.signup)}</td>
                  <td>{date(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination {...data} onPage={(p) => setParams({ q, status, page: String(p) })} />
        </div>
      )}
      {creating && (
        <Modal title="Add customer" onClose={() => setCreating(false)} wide>
          <ClientForm
            isNew
            initial={blank}
            onCancel={() => setCreating(false)}
            onSaved={(c) => {
              setCreating(false);
              reload();
              navigate(`/admin/clients/${c.id}`);
            }}
          />
        </Modal>
      )}
    </>
  );
}

export function AdminClientDetail() {
  const { id } = useParams();
  const toast = useToast();
  const dialog = useDialog();
  const { data, loading, error, reload } = useLoad(() => adminApi.get(`/clients/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [newLicense, setNewLicense] = useState(false);
  const [license, setLicense] = useState(null);

  if (loading) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  const c = data.client;

  const resetPassword = async () => {
    const ok = await dialog.confirm({
      title: 'Reset password?',
      message: `${c.email} gets a new temporary password and is signed out everywhere.`,
      confirmLabel: 'Reset password',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await adminApi.post(`/clients/${c.id}/reset-password`);
      await dialog.show({ title: 'Password reset', message: `Share this temporary password with ${c.email}.`, value: r.temporaryPassword });
      toast('Password reset');
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/admin/clients" className="muted small">
            ← Customers
          </Link>
          <h1>{c.businessName || c.name}</h1>
          <p className="muted">
            {c.name} · {c.email} {c.phone && `· ${c.phone}`}
          </p>
        </div>
        <div className="row">
          <Badge status={c.status} />
          <button className="btn" onClick={resetPassword}>
            Reset password
          </button>
          <button className="btn" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="btn btn-primary" onClick={() => setNewLicense(true)} data-testid="client-new-license">
            Give a license
          </button>
        </div>
      </div>
      <div className="card">
        <dl className="kv kv-3">
          <dt>GSTIN</dt>
          <dd>{c.gstin || '—'}</dd>
          <dt>Business type</dt>
          <dd>{c.businessType || '—'}</dd>
          <dt>State</dt>
          <dd>{c.state || '—'}</dd>
          <dt>Address</dt>
          <dd>{[c.address, c.city, c.pin].filter(Boolean).join(', ') || '—'}</dd>
          <dt>Joined</dt>
          <dd>{dateTime(c.createdAt)}</dd>
          <dt>Last sign-in</dt>
          <dd>{dateTime(c.lastLoginAt)}</dd>
          <dt>Came from</dt>
          <dd>
            {signupLabel(c.signup)}
            {c.signup?.details?.landing && <div className="muted small mono">{c.signup.details.landing}</div>}
          </dd>
        </dl>
      </div>
      <h2 className="section-title">Licenses</h2>
      {!data.licenses.length ? (
        <Empty>No licenses yet.</Empty>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Product</th>
                <th>Status</th>
                <th>Valid until</th>
                <th>Devices</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.licenses.map((l) => (
                <tr key={l.id}>
                  <td className="mono">
                    {l.code} <CopyButton text={l.code} />
                  </td>
                  <td>{l.planName}</td>
                  <td>
                    <Badge status={l.status} />
                  </td>
                  <td>{validity(l)}</td>
                  <td className="small">
                    {l.devices.filter((d) => !d.released_at && d.kind !== 'mobile').length} / {l.maxDevices} computers
                    <br />
                    {l.devices.filter((d) => !d.released_at && d.kind === 'mobile').length} / {l.maxMobileDevices} phones
                  </td>
                  <td className="right">
                    <button className="btn btn-sm" onClick={() => setLicense(l.id)}>
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 className="section-title">Payments</h2>
      {!data.payments.length ? (
        <Empty>No payments.</Empty>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Date</th>
                <th>Method</th>
                <th className="right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p.id}>
                  <td>#{p.id}</td>
                  <td>{dateTime(p.createdAt)}</td>
                  <td>{p.provider}</td>
                  <td className="right">{money(p.amount, p.currency)}</td>
                  <td>
                    <Badge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal title="Edit customer" onClose={() => setEditing(false)} wide>
          <ClientForm
            initial={{ ...blank, ...c, business_name: c.businessName, business_type: c.businessType }}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              reload();
            }}
          />
        </Modal>
      )}
      {newLicense && (
        <NewLicenseModal
          clientId={c.id}
          onClose={() => setNewLicense(false)}
          onDone={() => {
            setNewLicense(false);
            reload();
          }}
        />
      )}
      {license && (
        <LicenseEditor
          id={license}
          onClose={() => {
            setLicense(null);
            reload();
          }}
        />
      )}
    </>
  );
}

export function NewLicenseModal({ clientId, onClose, onDone }) {
  const toast = useToast();
  const plans = useLoad(async () => ({ plans: (await adminApi.get('/plans')).plans.filter((p) => p.isActive) }), []);
  const [form, setForm] = useState({ planId: '', count: 1, activateNow: !!clientId, durationDays: '', maxDevices: '', maxMobileDevices: '', expiresAt: '', notes: '' });
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const set = (k) => (v) => setForm({ ...form, [k]: v });
  const submit = async (e) => {
    e.preventDefault();
    try {
      const body = {
        planId: Number(form.planId || plans.data.plans[0].id),
        count: clientId ? 1 : Number(form.count),
        activateNow: form.activateNow,
        notes: form.notes,
        ...(clientId ? { clientId } : {}),
        ...(form.durationDays !== '' ? { durationDays: Number(form.durationDays) } : {}),
        ...(form.maxDevices !== '' ? { maxDevices: Number(form.maxDevices) } : {}),
        ...(form.maxMobileDevices !== '' ? { maxMobileDevices: Number(form.maxMobileDevices) } : {}),
        ...(form.expiresAt ? { expiresAt: form.expiresAt } : {}),
      };
      const r = await adminApi.post('/licenses', body);
      toast(`${r.licenses.length} license(s) created`);
      setCreated(r.licenses);
    } catch (err) {
      setError(err);
    }
  };
  if (created) {
    return (
      <Modal title="Licenses created" onClose={onDone}>
        <p className="muted">Share these license codes with the customer. They enter them in DocGen under “I Have a License”.</p>
        <textarea className="input mono" rows={Math.min(12, created.length + 1)} readOnly value={created.map((l) => l.code).join('\n')} data-testid="created-codes" />
        <div className="row end">
          <CopyButton text={created.map((l) => l.code).join('\n')} label="Copy all" />
          <button className="btn btn-primary" onClick={onDone}>
            Done
          </button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={clientId ? 'Give a license (no payment)' : 'Create license codes'} onClose={onClose}>
      {plans.loading ? (
        <Spinner />
      ) : (
        <form className="form" onSubmit={submit}>
          <ErrorText error={error} />
          <div className="grid-2">
            <Field label="Product" hint="Validity and computers come from the product unless set below">
              <Select
                value={form.planId}
                onChange={set('planId')}
                options={plans.data.plans.map((p) => ({ value: String(p.id), label: `${p.name} (${p.durationDays ? `${p.durationDays} days` : 'lifetime'}, ${p.maxDevices} PC, ${p.maxMobileDevices} phones)` }))}
              />
            </Field>
            {!clientId && (
              <Field label="How many codes" hint="Up to 500 at once">
                <Input type="number" min="1" max="500" value={form.count} onChange={set('count')} />
              </Field>
            )}
            <Field label="Validity in days (optional)" hint="Overrides the product; 0 = lifetime">
              <Input type="number" min="0" value={form.durationDays} onChange={set('durationDays')} />
            </Field>
            <Field label="Computers allowed (optional)">
              <Input type="number" min="1" value={form.maxDevices} onChange={set('maxDevices')} />
            </Field>
            <Field label="Phones allowed (optional)">
              <Input type="number" min="0" value={form.maxMobileDevices} onChange={set('maxMobileDevices')} />
            </Field>
            <Field label="Fixed expiry date (optional)">
              <Input type="date" value={form.expiresAt} onChange={set('expiresAt')} />
            </Field>
            <Field label="Notes">
              <Input value={form.notes} onChange={set('notes')} placeholder="e.g. Dealer batch / offline payment" />
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.activateNow} onChange={(e) => set('activateNow')(e.target.checked)} />
            <span>Validity starts today (otherwise it starts when the code is first used on a computer)</span>
          </label>
          <div className="row end">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" data-testid="create-license">
              Create
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
