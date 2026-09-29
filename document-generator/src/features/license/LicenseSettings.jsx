import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { refreshLicense, signOutLicense } from '../../services/licenseService.js';
import { openExternal } from '../../services/systemService.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useConfirm, useToast } from '../../hooks/useUi.jsx';
import { APP_CONFIG } from '../../config/appConfig.js';
import ActivationOptions from './ActivationOptions.jsx';
import { date, licenseSummary } from './licenseFormat.js';

/** Settings → License & Account */
export default function LicenseSettings() {
  const { license, setLicense } = useAppData();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  if (!license) return null;
  const l = license.license || {};
  const summary = licenseSummary(license);

  const refresh = async () => {
    setBusy(true);
    try {
      const s = await refreshLicense();
      await setLicense(s);
      toast.success('License information is up to date');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    const ok = await confirm({
      title: 'Sign out on this computer?',
      message: 'This computer is removed from your license so you can use it on another one. Your documents stay here. You can sign in again at any time.',
      confirmText: 'Sign out',
      danger: true,
    });
    if (!ok) return;
    try {
      await setLicense(await signOutLicense());
      toast.success('Signed out on this computer');
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="settings-section">
      <h2>License &amp; Account</h2>
      <div className={`license-status tone-${summary.tone}`} data-testid="license-status">
        <Icon name={license.licensed ? 'shield' : 'calendar'} size={20} />
        <div>
          <strong>
            {license.licensed ? 'DocGen is activated' : license.mode === 'trial' ? `Free trial — ${license.trialDaysLeft} days left` : 'Trial ended'}
          </strong>
          <div className="muted small">
            {license.licensed
              ? `${l.planName || 'License'} · ${l.expiresAt ? `valid until ${date(l.expiresAt)}` : 'lifetime'}`
              : `Trial ${license.mode === 'trial' ? 'ends' : 'ended'} on ${date(license.trialEndsAt)}`}
          </div>
        </div>
      </div>

      {license.licensed ? (
        <>
          <dl className="about-list compact">
            <dt>Account</dt>
            <dd>{l.email || '—'}</dd>
            <dt>Business</dt>
            <dd>{l.business || l.name || '—'}</dd>
            <dt>Plan</dt>
            <dd>{l.planName || '—'}</dd>
            <dt>Activation code</dt>
            <dd className="mono">{l.code ? `${l.code.slice(0, 5)}••••-••••` : '—'}</dd>
            <dt>Valid until</dt>
            <dd>{l.expiresAt ? `${date(l.expiresAt)} (${l.daysLeft} days)` : 'Lifetime'}</dd>
            <dt>Computers allowed</dt>
            <dd>{l.maxDevices ?? '—'}</dd>
            <dt>This computer</dt>
            <dd>{license.deviceName}</dd>
            <dt>Last checked</dt>
            <dd>{license.lastRefreshAt ? date(license.lastRefreshAt) : '—'}</dd>
          </dl>
          <div className="row gap wrap">
            <button className="btn" onClick={refresh} disabled={busy}>
              <Icon name="refresh" size={16} /> {busy ? 'Checking…' : 'Check license now'}
            </button>
            {license.portalUrl && (
              <button className="btn" onClick={() => openExternal(`${license.portalUrl}/account`).catch((e) => toast.error(e.message))}>
                <Icon name="globe" size={16} /> Manage in client portal
              </button>
            )}
            <button className="btn btn-danger-outline" onClick={signOut}>
              <Icon name="logout" size={16} /> Sign out on this computer
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">Activate DocGen with your account or an activation code. You can buy a plan in the client portal.</p>
          <ActivationOptions allowSkip={false} />
        </>
      )}

      <h3>Why activate?</h3>
      <ul className="check-list">
        {APP_CONFIG.premiumFeatures.map((f) => (
          <li key={f}>
            <Icon name="check" size={16} /> {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
