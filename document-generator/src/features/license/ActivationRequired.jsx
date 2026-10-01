/**
 * Shown over the app when the 30-day period (or the license) has ended.
 * It cannot be closed: the user signs in or enters a license. Nothing is deleted.
 */

import { useState } from 'react';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import { refreshLicense } from '../../services/licenseService.js';
import { openExternal } from '../../services/systemService.js';
import { APP_CONFIG } from '../../config/appConfig.js';
import ActivationOptions from './ActivationOptions.jsx';

export default function ActivationRequired() {
  const { license, setLicense } = useAppData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const problem = license?.licenseProblem;
  const hasLicense = !!license?.license;
  const checkAgain = async () => {
    setBusy(true);
    try {
      const s = await refreshLicense();
      await setLicense(s);
      if (s.licensed) toast.success('Thank you — your license is active again.');
      else toast.error(s.license?.status === 'expired' ? 'The license is still expired. Renew it in your account, then check again.' : 'The license is still not active. Please contact us.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const message =
    problem === 'expired'
      ? 'Your DocGen license has expired. To continue, log in with your account or enter a valid license.'
      : problem === 'suspended' || problem === 'revoked'
        ? 'Your DocGen license is not active. To continue, log in with your account or enter a valid license.'
        : 'Your 30-day period has ended. To continue using DocGen, log in with your account or enter a valid license.';
  return (
    <div className="modal-backdrop activation-backdrop" data-testid="activation-required">
      <div className="modal activation-modal" role="alertdialog" aria-modal="true" aria-labelledby="activation-title">
        <h2 id="activation-title">Activation required</h2>
        <p className="muted">{message}</p>
        {hasLicense && (
          <div className="row gap wrap activation-renew">
            {problem === 'expired' && license.portalUrl && (
              <button className="btn btn-primary" onClick={() => openExternal(`${license.portalUrl}/account`).catch((e) => toast.error(e.message))} data-testid="renew-online">
                Renew online
              </button>
            )}
            <button className="btn" onClick={checkAgain} disabled={busy} data-testid="check-again">
              {busy ? 'Checking…' : 'I have renewed — check again'}
            </button>
          </div>
        )}
        <ActivationOptions />
        <p className="activation-note small muted">
          You can request through email or call for extending your time.
          <br />
          {APP_CONFIG.supportEmail} · {APP_CONFIG.supportPhone}
        </p>
      </div>
    </div>
  );
}
