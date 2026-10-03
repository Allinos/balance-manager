/** First start: activate with the license key or the account; and the screens shown when a license stops working. */

import { useState } from 'react';
import { Field, Input, useUi } from '../components/ui.jsx';
import InstallBanner from '../components/InstallBanner.jsx';
import { activateWithKey, activateWithLogin, formatKey, refresh, signOut } from '../lib/license.js';
import { shortDate } from '../lib/docs.js';
import { useApp } from '../App.jsx';

function Logo() {
  return (
    <div className="gate-logo">
      <img src="/app/icons/icon-192.png" alt="" />
      <span className="wordmark">
        <span className="doc">Doc</span>
        <span className="gen">Gen</span>
      </span>
    </div>
  );
}

export default function Activation({ onDone, message }) {
  const [mode, setMode] = useState('key');
  const [key, setKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(message || '');
  const valid = mode === 'key' ? /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key) : email.includes('@') && password.length > 0;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'key') await activateWithKey(key);
      else await activateWithLogin(email.trim(), password);
      await onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate" data-testid="activation">
      <Logo />
      <div>
        <h1>Activate DocGen Mobile</h1>
        <p className="muted">Enter your license key once. DocGen remembers it on this phone while the license is valid.</p>
      </div>
      <div className="segmented" role="tablist">
        <button className={mode === 'key' ? 'active' : ''} onClick={() => setMode('key')} role="tab" aria-selected={mode === 'key'}>
          License key
        </button>
        <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} role="tab" aria-selected={mode === 'login'} data-testid="mode-login">
          Email & password
        </button>
      </div>
      <form className="form" onSubmit={submit}>
        {mode === 'key' ? (
          <Field label="License key" hint="From your account (My License) or the purchase email">
            <Input
              className="input code-input"
              value={key}
              onChange={(v) => setKey(formatKey(v))}
              placeholder="AB12-CD34-EF56"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              data-testid="license-key"
            />
          </Field>
        ) : (
          <>
            <Field label="Email">
              <Input type="email" value={email} onChange={setEmail} autoComplete="username" data-testid="login-email" />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={setPassword} autoComplete="current-password" data-testid="login-password" />
            </Field>
          </>
        )}
        {error && (
          <div className="alert alert-bad" role="alert" data-testid="activation-error">
            {error}
          </div>
        )}
        <button className="btn btn-primary btn-block" disabled={!valid || busy} data-testid="activate">
          {busy ? 'Activating…' : 'Activate'}
        </button>
      </form>
      <p className="small muted center">
        No license yet? <a href="/account/services">Buy DocGen</a> · One license works on your computer and on your phones.
      </p>
      <InstallBanner />
    </div>
  );
}

/** License expired, suspended, or not checked online for too long. */
export function Locked() {
  const { lic, reload } = useApp();
  const { toast } = useUi();
  const [busy, setBusy] = useState(false);
  const l = lic.license;
  const text =
    lic.state === 'expired'
      ? `Your DocGen license expired on ${shortDate(l.expiresAt)}. Extend it in your account, then tap “Check again”. Your documents are safe on this phone.`
      : lic.state === 'blocked'
        ? 'Your DocGen license is not active. Please contact support@reynrel.in.'
        : 'DocGen needs to check your license once. Please connect to the internet and tap “Check again”.';
  const again = async () => {
    setBusy(true);
    try {
      await refresh();
      const next = await reload();
      if (next.state !== 'active') toast(next.state === 'none' ? 'This phone was removed from the license.' : 'The license is still not active.', 'bad');
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="gate" data-testid="locked">
      <Logo />
      <h1>{lic.state === 'offline' ? 'Connect to the internet' : 'License not active'}</h1>
      <div className={`alert ${lic.state === 'offline' ? 'alert-info' : 'alert-warn'}`}>{text}</div>
      {lic.state === 'expired' && (
        <a className="btn btn-primary btn-block" href={`/account/services`}>
          Extend license
        </a>
      )}
      <button className="btn btn-block" onClick={again} disabled={busy} data-testid="check-again">
        {busy ? 'Checking…' : 'Check again'}
      </button>
      <button
        className="btn btn-block btn-danger"
        onClick={async () => {
          await signOut();
          await reload();
        }}
      >
        Use another license key
      </button>
    </div>
  );
}
