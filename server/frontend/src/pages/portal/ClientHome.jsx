/**
 * Client panel → My License: license key, product, start and expiry date, remaining validity,
 * the computers and phones using it, and payment history.
 */

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { clientApi, date, money, session } from '../../api.js';
import { Badge, CopyButton, Empty, ErrorText, Field, Input, Spinner, useDialog, useLoad, useToast } from '../../components/ui.jsx';
import Icon from '../../components/Icons.jsx';
import { useAuth } from '../../App.jsx';

export const STATUS_TEXT = { active: 'Active', expired: 'Expired', suspended: 'Suspended', revoked: 'Cancelled', unused: 'Ready to activate' };

/** Active licenses first (latest end date), then the rest. */
export const sortLicenses = (licenses) =>
  [...licenses].sort((a, b) => (b.status === 'active') - (a.status === 'active') || String(b.expiresAt || '9').localeCompare(String(a.expiresAt || '9')));

export function Validity({ license: l }) {
  if (l.lifetime) return <p className="validity"><strong>Valid for life</strong></p>;
  if (!l.expiresAt) return <p className="validity">Valid for {l.durationDays} days from the first activation</p>;
  const total = Math.max(1, l.durationDays || 365);
  const pct = Math.max(0, Math.min(100, (l.daysLeft / total) * 100));
  const tone = l.status === 'expired' ? 'bad' : l.daysLeft <= 30 ? 'warn' : '';
  return (
    <div className="validity" data-testid="validity">
      <div className="row between">
        <span>
          {l.status === 'expired' ? 'Expired on ' : 'Valid until '}
          <strong>{date(l.expiresAt)}</strong>
        </span>
        {l.status !== 'expired' && (
          <strong style={{ color: tone ? 'var(--warn)' : 'var(--good)' }} data-testid="days-left">
            {l.daysLeft} {l.daysLeft === 1 ? 'day' : 'days'} left
          </strong>
        )}
      </div>
      <div className={`validity-bar ${tone}`}>
        <span style={{ width: `${l.status === 'expired' ? 100 : pct}%` }} />
      </div>
    </div>
  );
}

function SetPassword() {
  const { client } = useAuth();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await clientApi.put('/me/password', { newPassword: value });
      session.set('client', r.token);
      client.setUser(r.client);
      toast('Password saved. Use it to sign in here and in the DocGen apps.');
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form className="card form" onSubmit={save} data-testid="set-password">
      <div>
        <strong>Create a password</strong>
        <p className="muted small">So you can sign in to this page again later. It also works in the DocGen apps instead of the license key.</p>
      </div>
      <ErrorText error={error} />
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="New password" hint="At least 8 characters">
          <Input type="password" value={value} onChange={setValue} required minLength={8} autoComplete="new-password" data-testid="new-password" />
        </Field>
        <button className="btn btn-primary">Save password</button>
      </div>
    </form>
  );
}

function Devices({ license, onRelease }) {
  const groups = [
    ['desktop', 'Computers', 'monitor', license.maxDevices],
    ['mobile', 'Phones & tablets', 'phone', license.maxMobileDevices],
  ];
  return (
    <div className="device-groups">
      {groups.map(([kind, label, icon, max]) => {
        const list = license.devices.filter((d) => (d.kind || 'desktop') === kind);
        return (
          <div key={kind} className="device-group" data-testid={`devices-${kind}`}>
            <div className="device-group-head">
              <Icon name={icon} size={16} />
              <strong>{label}</strong>
              <span className="muted small">
                {list.length} of {max} in use
              </span>
            </div>
            {list.map((d) => (
              <div key={d.id} className="device-row">
                <span>
                  {d.name || (kind === 'mobile' ? 'Phone' : 'Computer')}
                  <span className="muted small"> · last used {date(d.lastSeenAt)}</span>
                </span>
                <button className="link-btn small" onClick={() => onRelease(d)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function LicenseCard({ license: l, onRelease, main }) {
  const canExtend = !l.lifetime && ['active', 'expired'].includes(l.status);
  return (
    <section className="card license-card" data-testid={main ? 'license-card' : 'license-card-other'}>
      <div className="license-card-head">
        <div className="row">
          <h2>{l.planName}</h2>
          <Badge status={l.status}>{STATUS_TEXT[l.status] || l.status}</Badge>
        </div>
        {canExtend && (
          <Link className="btn btn-primary btn-sm" to={`/account/services?extend=${l.id}`} data-testid={main ? 'extend' : undefined}>
            <Icon name="calendar" size={15} /> Extend
          </Link>
        )}
      </div>
      <div className="code-box">
        <span>
          <span className="muted small">License key</span>
          <br />
          <span className="code" data-testid={main ? 'license-code' : undefined}>
            {l.code}
          </span>
        </span>
        <CopyButton text={l.code} label="Copy key" />
      </div>
      <dl className="facts">
        <div>
          <dt>Start date</dt>
          <dd data-testid={main ? 'start-date' : undefined}>{date(l.activatedAt)}</dd>
        </div>
        <div>
          <dt>Expiry date</dt>
          <dd data-testid={main ? 'expiry-date' : undefined}>{l.lifetime ? 'Never (lifetime)' : date(l.expiresAt)}</dd>
        </div>
        <div>
          <dt>Computers</dt>
          <dd>{l.maxDevices}</dd>
        </div>
        <div>
          <dt>Phones & tablets</dt>
          <dd>{l.maxMobileDevices}</dd>
        </div>
      </dl>
      <Validity license={l} />
      {l.status === 'expired' && (
        <div className="alert alert-warn">
          This license has expired, so DocGen asks for activation. Extend it — the apps pick up the new date automatically.
        </div>
      )}
      {(l.status === 'suspended' || l.status === 'revoked') && <div className="alert alert-error">This license is not active. Please contact support@reynrel.in.</div>}
      <Devices license={l} onRelease={(d) => onRelease(l, d)} />
    </section>
  );
}

function Payments() {
  const { data, loading } = useLoad(() => clientApi.get('/payments?pageSize=20'), []);
  if (loading) return <Spinner />;
  const rows = (data?.rows || []).filter((p) => p.status !== 'created');
  if (!rows.length) return null;
  return (
    <section className="card table-card">
      <div className="card-head" style={{ padding: '16px 20px 0' }}>
        <h3>Payments</h3>
      </div>
      <table className="table" data-testid="purchases">
        <thead>
          <tr>
            <th>Date</th>
            <th>Item</th>
            <th>Order</th>
            <th className="right">Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="nowrap">{date(p.paidAt || p.createdAt)}</td>
              <td>
                {p.planName}
                {p.durationLabel && (
                  <span className="muted small">
                    {' '}
                    · {p.durationLabel}
                    {p.renewal ? ' extension' : ''}
                  </span>
                )}
              </td>
              <td className="muted">#{p.id}</td>
              <td className="right nowrap">{money(p.amount, p.currency)}</td>
              <td>
                <Badge status={p.status}>{p.status === 'pending' ? 'awaiting payment' : p.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function ClientHome() {
  const { client } = useAuth();
  const toast = useToast();
  const dialog = useDialog();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload } = useLoad(() => clientApi.get('/licenses'), []);

  useEffect(() => {
    if (params.get('download') === 'expired') {
      toast('That download link has expired — use Downloads to get a new one.', 'info');
      setParams({}, { replace: true });
    }
  }, [params, setParams, toast]);

  if (loading) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  const licenses = sortLicenses(data.licenses);

  const release = async (license, dev) => {
    const ok = await dialog.confirm({
      title: dev.kind === 'mobile' ? 'Remove this phone?' : 'Remove this computer?',
      message: `"${dev.name || 'This device'}" will be signed out of DocGen, so you can use the license on another one. Documents on that device are not deleted.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await clientApi.post(`/licenses/${license.id}/devices/${dev.id}/release`);
      toast('Device removed');
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hello, {client.user.name.split(' ')[0]}</h1>
          <p className="muted">{params.get('welcome') ? 'Welcome to DocGen! Your license key and downloads are ready.' : 'Your DocGen license, devices and payments.'}</p>
        </div>
        {licenses.length > 0 && (
          <Link className="btn" to="/account/downloads">
            <Icon name="download" size={16} /> Downloads
          </Link>
        )}
      </div>

      {!client.user.hasPassword && <SetPassword />}

      {!licenses.length ? (
        <Empty>
          <p>You don&apos;t have a DocGen license yet.</p>
          <Link className="btn btn-primary" to="/account/services" style={{ marginTop: 10 }}>
            See plans and prices
          </Link>
        </Empty>
      ) : (
        licenses.map((l, i) => <LicenseCard key={l.id} license={l} main={i === 0} onRelease={release} />)
      )}

      {licenses.length > 0 && (
        <div className="card how">
          <strong>How to use your license</strong>
          <ol>
            <li>
              <b>Computer:</b> install DocGen from <Link to="/account/downloads">Downloads</Link>, open it, choose <b>I Have a License</b> and enter the key.
            </li>
            <li>
              <b>Phone:</b> open <Link to="/mobile">DocGen Mobile</Link>, install it and enter the same key
              {client.user.hasPassword ? ' — or sign in with your email and password' : ''}.
            </li>
          </ol>
        </div>
      )}

      <Payments />
    </>
  );
}
