/**
 * Activation choices, used at the end of setup, in the activation popup after
 * the 30-day period, and in Settings → License & Account:
 *
 *   [ Login Using Your Account ]   OR   [ I Have a License ]
 *                          Skip                               (setup only)
 *
 * Choosing a card replaces the cards with that card's form (with Back).
 */

import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { activateWithCode, formatActivationCode, isValidActivationCode, loginWithAccount } from '../../services/licenseService.js';
import { openExternal } from '../../services/systemService.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import { APP_CONFIG } from '../../config/appConfig.js';

export function CreateAccountLink() {
  const { license } = useAppData();
  const toast = useToast();
  const url = license?.registerUrl || APP_CONFIG.website;
  return (
    <button type="button" className="link" onClick={() => openExternal(url).catch((e) => toast.error(e.message))} data-testid="create-account">
      Create Account
    </button>
  );
}

/**
 * @param {{ onDone?: (status: object) => void, onSkip?: () => void }} props
 *   onSkip: when given, a "Skip" link is shown under the cards.
 */
export default function ActivationOptions({ onDone, onSkip }) {
  const { license, setLicense } = useAppData();
  const toast = useToast();
  const [view, setView] = useState('choose'); // 'choose' | 'login' | 'code'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const offlineBuild = license && !license.serverConfigured;

  const open = (next) => {
    setError('');
    setView(next);
  };

  const finish = async (status, message) => {
    await setLicense(status);
    if (status.licensed) {
      toast.success(message);
      onDone?.(status);
    } else {
      setError('This license is not active. Please renew it or contact us.');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (view === 'code' && !isValidActivationCode(code)) {
      setError('Enter the 12-character code, e.g. AB12-CD34-EF56.');
      return;
    }
    setBusy(true);
    try {
      if (view === 'login') await finish(await loginWithAccount(email, password), 'Signed in — DocGen is activated.');
      else await finish(await activateWithCode(code), 'License activated. Thank you!');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const skip = onSkip && (
    <div className="activate-skip">
      <button type="button" className="link" onClick={onSkip} data-testid="license-skip">
        Skip
      </button>
    </div>
  );

  if (view === 'choose') {
    return (
      <div className="activate">
        <div className="activate-choice">
          <button type="button" className="activate-card" onClick={() => open('login')} data-testid="choose-login">
            <span className="activate-icon">
              <Icon name="user" size={22} />
            </span>
            <strong>Login Using Your Account</strong>
          </button>
          <span className="activate-or">OR</span>
          <button type="button" className="activate-card" onClick={() => open('code')} data-testid="choose-code">
            <span className="activate-icon">
              <Icon name="key" size={22} />
            </span>
            <strong>I Have a License</strong>
          </button>
        </div>
        {skip}
      </div>
    );
  }

  return (
    <div className="activate">
      <form className="activate-form" onSubmit={submit} data-keynav>
        <h3>{view === 'login' ? 'Login Using Your Account' : 'I Have a License'}</h3>
        {offlineBuild && <p className="form-error">This copy of DocGen is not connected to the license server.</p>}
        {view === 'login' ? (
          <>
            <input className="input" type="text" placeholder="Email / User ID" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus data-testid="license-email" />
            <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" data-testid="license-password" />
          </>
        ) : (
          <input
            className="input code-input"
            placeholder="AB12-CD34-EF56"
            value={code}
            onChange={(e) => setCode(formatActivationCode(e.target.value))}
            maxLength={14}
            spellCheck={false}
            autoFocus
            aria-label="License / activation code"
            data-testid="license-code"
          />
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <button
          className="btn btn-primary btn-block"
          disabled={busy || offlineBuild || (view === 'login' ? !email || !password : !isValidActivationCode(code))}
          data-testid={view === 'login' ? 'license-login' : 'license-activate'}
        >
          {busy ? 'Please wait…' : view === 'login' ? 'Sign In' : 'Activate'}
        </button>
        <div className="activate-form-foot">
          <button type="button" className="link muted" onClick={() => open('choose')} data-testid="activate-back">
            <Icon name="back" size={14} /> Back
          </button>
          {view === 'login' && (
            <span className="small">
              No account? <CreateAccountLink />
            </span>
          )}
        </div>
      </form>
      {skip}
    </div>
  );
}
