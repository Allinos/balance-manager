/**
 * Shown over the app when the 30-day period (or the license) has ended.
 * It cannot be closed: the user signs in or enters a license. Nothing is deleted.
 */

import { useAppData } from '../../hooks/useAppData.jsx';
import { APP_CONFIG } from '../../config/appConfig.js';
import ActivationOptions from './ActivationOptions.jsx';

export default function ActivationRequired() {
  const { license } = useAppData();
  const problem = license?.licenseProblem;
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
