/**
 * Shown instead of the app when the 30-day trial (or a license) has ended.
 * The user can still back up their data; nothing is ever deleted.
 */

import Icon from '../../components/Icon.jsx';
import { exportBackup } from '../../services/systemService.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import { APP_CONFIG } from '../../config/appConfig.js';
import { date } from './licenseFormat.js';
import ActivationOptions from './ActivationOptions.jsx';

export default function LicenseGate() {
  const { license } = useAppData();
  const toast = useToast();
  const problem = license?.licenseProblem;
  const title =
    problem === 'expired'
      ? 'Your DocGen license has expired'
      : problem === 'suspended' || problem === 'revoked'
        ? 'Your DocGen license is not active'
        : 'Your free trial has ended';
  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-brand">
          <img src={APP_CONFIG.iconUrl} alt="" />
          <div>
            <strong>{APP_CONFIG.appName}</strong>
            <small>{APP_CONFIG.tagline}</small>
          </div>
        </div>
        <h1>{title}</h1>
        <p className="muted">
          {problem === 'expired' && license?.license?.expiresAt
            ? `It expired on ${date(license.license.expiresAt)}. Renew it in the client portal, then sign in again or enter a new code.`
            : 'Sign in with your account or enter an activation code to continue. All your documents are safe and will be here after activation.'}
        </p>
        <ActivationOptions allowSkip={false} />
        <div className="gate-foot">
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              try {
                const path = await exportBackup();
                if (path) toast.success(`Backup saved to ${path}`);
              } catch (e) {
                toast.error(e.message);
              }
            }}
          >
            <Icon name="download" size={15} /> Back up my data
          </button>
          <span className="muted small">
            Need help? {APP_CONFIG.supportEmail} · {APP_CONFIG.supportPhone}
          </span>
        </div>
      </div>
    </div>
  );
}
