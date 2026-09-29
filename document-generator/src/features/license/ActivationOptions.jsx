/**
 * The three activation choices shown at the end of setup, when the trial ends,
 * and in Settings → License & Account:
 *   1. Login using your account (+ Create account → opens the portal in the browser)
 *   2. I have a license / activation code (AB12-CD34-EF56)
 *   3. Skip for now (30-day trial) — hidden once the trial has ended
 */

import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { activateWithCode, formatActivationCode, isValidActivationCode, loginWithAccount } from '../../services/licenseService.js';
import { openExternal } from '../../services/systemService.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import { APP_CONFIG } from '../../config/appConfig.js';

export function CreateAccountLink({ className = 'link' }) {
  const { license } = useAppData();
  const toast = useToast();
  const url = license?.registerUrl || `${APP_CONFIG.website}`;
  return (
    <button type="button" className={className} onClick={() => openExternal(url).catch((e) => toast.error(e.message))} data-testid="create-account">
      Create account
    </button>
  );
}

/**
 * @param {{ onDone?: (status: object) => void, onSkip?: () => void, allowSkip?: boolean, compact?: boolean }} props
 */
export default function ActivationOptions({ onDone, onSkip, allowSkip = true }) {
  const { license, setLicense } = useAppData();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState({ login: '', code: '' });
  const offlineBuild = license && !license.serverConfigured;

  const finish = async (status, message) => {
    await setLicense(status);
    if (status.licensed) {
      toast.success(message);
      onDone?.(status);
    } else {
      setError((e) => ({ ...e, login: 'The license on this account is not active. Please renew it in the client portal.' }));
    }
  };

  const login = async (e) => {
    e.preventDefault();
    setBusy('login');
    setError({ login: '', code: '' });
    try {
      await finish(await loginWithAccount(email, password), 'Signed in — DocGen is activated on this computer.');
    } catch (err) {
      setError((x) => ({ ...x, login: err.message }));
    } finally {
      setBusy('');
    }
  };

  const activate = async (e) => {
    e.preventDefault();
    if (!isValidActivationCode(code)) {
      setError((x) => ({ ...x, code: 'Enter the 12-character code, e.g. AB12-CD34-EF56.' }));
      return;
    }
    setBusy('code');
    setError({ login: '', code: '' });
    try {
      await finish(await activateWithCode(code), 'License activated. Thank you!');
    } catch (err) {
      setError((x) => ({ ...x, code: err.message }));
    } finally {
      setBusy('');
    }
  };

  const trialLeft = license?.trialDaysLeft ?? 30;

  return (
    <div className="activate">
      {offlineBuild && (
        <div className="callout callout-warn">
          <Icon name="wifiOff" />
          <span>This copy of DocGen is not connected to a license server, so sign-in and activation codes are not available. You can use the trial.</span>
        </div>
      )}
      <div className="activate-grid">
        <form className="activate-card" onSubmit={login}>
          <div className="activate-head">
            <span className="activate-icon">
              <Icon name="user" />
            </span>
            <div>
              <h3>Login using your account</h3>
              <p className="muted small">Use the email and password of your DocGen account.</p>
            </div>
          </div>
          <input className="input" type="email" placeholder="Email or user ID" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" data-testid="license-email" />
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" data-testid="license-password" />
          {error.login && <div className="form-error" role="alert">{error.login}</div>}
          <button className="btn btn-primary btn-block" disabled={busy !== '' || !email || !password || offlineBuild} data-testid="license-login">
            {busy === 'login' ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="muted small center">
            No account? <CreateAccountLink />
          </p>
        </form>

        <form className="activate-card" onSubmit={activate}>
          <div className="activate-head">
            <span className="activate-icon">
              <Icon name="key" />
            </span>
            <div>
              <h3>I have a license</h3>
              <p className="muted small">Enter your activation code.</p>
            </div>
          </div>
          <input
            className="input code-input"
            placeholder="AB12-CD34-EF56"
            value={code}
            onChange={(e) => setCode(formatActivationCode(e.target.value))}
            maxLength={14}
            spellCheck={false}
            autoCapitalize="characters"
            aria-label="Activation code"
            data-testid="license-code"
          />
          <p className="muted small">12 capital letters or numbers in three groups of four.</p>
          {error.code && <div className="form-error" role="alert">{error.code}</div>}
          <button className="btn btn-primary btn-block" disabled={busy !== '' || !isValidActivationCode(code) || offlineBuild} data-testid="license-activate">
            {busy === 'code' ? 'Activating…' : 'Activate'}
          </button>
        </form>

        {allowSkip && (
          <div className="activate-card activate-skip">
            <div className="activate-head">
              <span className="activate-icon">
                <Icon name="calendar" />
              </span>
              <div>
                <h3>Skip for now</h3>
                <p className="muted small">
                  Use every feature free for <strong>{trialLeft} {trialLeft === 1 ? 'day' : 'days'}</strong>. Activate any time from Settings.
                </p>
              </div>
            </div>
            <div className="activate-skip-actions">
              <button type="button" className="btn btn-block" onClick={onSkip} data-testid="license-skip">
                Skip — start free trial
              </button>
              <p className="muted small center">
                Need an account? <CreateAccountLink />
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
