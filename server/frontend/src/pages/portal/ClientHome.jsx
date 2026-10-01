/**
 * Client panel: the license (status, remaining validity, code), download, computers, purchases, renew.
 * Nothing technical, nothing the customer does not need.
 */

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { clientApi, date, money, session } from '../../api.js';
import { Badge, CopyButton, Empty, ErrorText, Field, Input, Spinner, useDialog, useLoad, useToast } from '../../components/ui.jsx';
import { DownloadCard } from '../../components/Downloads.jsx';
import { usePayment } from '../../components/Payment.jsx';
import { useAuth } from '../../App.jsx';
import { period } from './ProductPage.jsx';

const STATUS_TEXT = { active: 'Active', expired: 'Expired', suspended: 'Suspended', revoked: 'Cancelled', unused: 'Ready to activate' };

/** The license that matters: an active one (latest end date), else the newest. */
const mainLicense = (licenses) =>
  [...licenses].sort((a, b) => (b.status === 'active') - (a.status === 'active') || String(b.expiresAt || '9').localeCompare(String(a.expiresAt || '9')))[0];

function Validity({ license: l }) {
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
      toast('Password saved. Use it to sign in here and in the DocGen app.');
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form className="card form" onSubmit={save} data-testid="set-password">
      <div>
        <strong>Create a password</strong>
        <p className="muted small">So you can sign in to this page again later. It also works in the DocGen app instead of the license code.</p>
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

function Purchases() {
  const { data, loading } = useLoad(() => clientApi.get('/payments?pageSize=20'), []);
  if (loading) return <Spinner />;
  const rows = (data?.rows || []).filter((p) => p.status !== 'created');
  if (!rows.length) return null;
  return (
    <section className="card table-card">
      <div className="card-head" style={{ padding: '16px 20px 0' }}>
        <h3>Purchases</h3>
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
              <td>{date(p.paidAt || p.createdAt)}</td>
              <td>{p.planName}</td>
              <td className="muted">#{p.id}</td>
              <td className="right">{money(p.amount, p.currency)}</td>
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
  const { data, loading, error, reload } = useLoad(async () => {
    const [licenses, site] = await Promise.all([clientApi.get('/licenses'), clientApi.get('/site')]);
    return { licenses: licenses.licenses, product: site.products[0] || null };
  }, []);
  const { pay, element } = usePayment();
  const [renewing, setRenewing] = useState(false);
  const [purchasesKey, setPurchasesKey] = useState(0);

  useEffect(() => {
    if (params.get('download') === 'expired') {
      toast('That download link has expired — use the Download button below.', 'info');
      setParams({}, { replace: true });
    }
  }, [params, setParams, toast]);

  if (loading) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  const { licenses, product } = data;
  const license = licenses.length ? mainLicense(licenses) : null;
  const others = licenses.filter((l) => l !== license);
  const canRenew = license && product && !license.lifetime && ['active', 'expired'].includes(license.status);

  const renew = async () => {
    setRenewing(true);
    try {
      const started = await clientApi.post('/checkout', { planId: product.id, renewLicenseId: license.id });
      const r = await pay(started, (body) => clientApi.post(`/payments/${started.payment.id}/confirm`, body));
      if (r?.license) {
        toast(`Thank you! Your license is now valid until ${date(r.license.expiresAt)}.`);
        reload();
        setPurchasesKey((k) => k + 1);
      }
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setRenewing(false);
    }
  };

  const release = async (dev) => {
    const ok = await dialog.confirm({
      title: 'Remove this computer?',
      message: `"${dev.name || 'This computer'}" will be signed out of DocGen. You can then activate DocGen on another computer. Documents on that computer are not deleted.`,
      confirmLabel: 'Remove computer',
      danger: true,
    });
    if (!ok) return;
    try {
      await clientApi.post(`/licenses/${license.id}/devices/${dev.id}/release`);
      toast('Computer removed');
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
          <p className="muted">{params.get('welcome') ? 'Welcome to DocGen! Everything you need is on this page.' : 'Your DocGen license and downloads.'}</p>
        </div>
      </div>

      {!client.user.hasPassword && <SetPassword />}

      {!license ? (
        <Empty>
          <p>You don&apos;t have a DocGen license yet.</p>
          <Link className="btn btn-primary" to="/buy" style={{ marginTop: 10 }}>
            Buy DocGen{product ? ` — ${money(product.price, product.currency)}` : ''}
          </Link>
        </Empty>
      ) : (
        <section className="card" data-testid="license-card">
          <div className="license-hero">
            <div>
              <div className="row">
                <h2>{license.planName}</h2>
                <Badge status={license.status}>{STATUS_TEXT[license.status] || license.status}</Badge>
              </div>
              <div className="code-box">
                <span>
                  <span className="muted small">License code</span>
                  <br />
                  <span className="code" data-testid="license-code">
                    {license.code}
                  </span>
                </span>
                <CopyButton text={license.code} label="Copy code" />
              </div>
              <Validity license={license} />
            </div>
            {canRenew && (
              <div className="stack" style={{ gap: 6, minWidth: 220 }}>
                <button className="btn btn-primary" onClick={renew} disabled={renewing} data-testid="renew">
                  {renewing ? 'Please wait…' : `Renew · ${money(product.price, product.currency)}`}
                </button>
                <span className="muted small center">Adds {period(product.durationDays)} to your end date</span>
              </div>
            )}
          </div>
          {license.status === 'expired' && (
            <div className="alert alert-warn" style={{ marginTop: 12 }}>
              Your license has expired, so DocGen asks for activation. Renew it here — the app picks up the new date when you choose “I have renewed — check again”.
            </div>
          )}
          {(license.status === 'suspended' || license.status === 'revoked') && (
            <div className="alert alert-error" style={{ marginTop: 12 }}>
              This license is not active. Please contact support@reynrel.in.
            </div>
          )}
          <dl className="kv" style={{ marginTop: 16, marginBottom: 0 }}>
            <dt>Computers</dt>
            <dd>
              {license.devices.length} of {license.maxDevices} in use
              {license.devices.map((d) => (
                <div key={d.id} className="row small" style={{ marginTop: 6 }}>
                  <span>
                    {d.name || 'Computer'} <span className="muted">· last used {date(d.lastSeenAt)}</span>
                  </span>
                  <button className="link-btn small" onClick={() => release(d)}>
                    Remove
                  </button>
                </div>
              ))}
            </dd>
          </dl>
        </section>
      )}

      {license && <DownloadCard />}

      {license && (
        <div className="card how">
          <strong>How to activate DocGen</strong>
          <ol>
            <li>Download and install DocGen, then open it.</li>
            <li>
              Choose <b>I Have a License</b> and enter your license code{client.user.hasPassword ? <> — or choose <b>Login Using Your Account</b> with {client.user.email}</> : null}.
            </li>
          </ol>
        </div>
      )}

      {others.length > 0 && (
        <section className="card">
          <h3>Other licenses</h3>
          <ul className="list">
            {others.map((l) => (
              <li key={l.id}>
                <span>
                  <span className="mono">{l.code}</span> <span className="muted small">· {l.planName}</span>
                </span>
                <span className="row">
                  <span className="small muted">{l.lifetime ? 'Lifetime' : l.expiresAt ? `until ${date(l.expiresAt)}` : ''}</span>
                  <Badge status={l.status}>{STATUS_TEXT[l.status] || l.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Purchases key={purchasesKey} />
      {element}
    </>
  );
}
