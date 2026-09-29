/**
 * Gentle reminder near the end of the trial or of a license. Never blocks work.
 * Shown in the last 7 days of the trial and the last 15 days of a license;
 * can be dismissed for the day.
 */

import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useRouter } from '../../router/router.jsx';

const KEY = 'docgen.banner.dismissed';
const today = () => new Date().toISOString().slice(0, 10);

function dismissedToday() {
  try {
    return localStorage.getItem(KEY) === today();
  } catch {
    return false;
  }
}

export default function TrialBanner() {
  const { license } = useAppData();
  const { navigate } = useRouter();
  const [hidden, setHidden] = useState(dismissedToday);
  if (!license || hidden) return null;
  let text = '';
  if (license.mode === 'trial' && license.trialDaysLeft <= 7) {
    text =
      license.trialDaysLeft <= 1
        ? 'Your free trial ends today. Activate DocGen to keep creating documents.'
        : `Your free trial ends in ${license.trialDaysLeft} days. Activate DocGen to keep creating documents without interruption.`;
  } else if (license.licensed && license.license?.daysLeft !== null && license.license?.daysLeft <= 15) {
    text = `Your ${license.license.planName || 'DocGen'} license ends in ${license.license.daysLeft} days. Renew it in the client portal.`;
  }
  if (!text) return null;
  return (
    <div className="trial-banner no-print" role="status" data-testid="trial-banner">
      <Icon name="info" size={16} />
      <span>{text}</span>
      <button className="btn btn-sm btn-primary" onClick={() => navigate('/settings/license')}>
        Activate
      </button>
      <button
        className="icon-btn"
        aria-label="Dismiss for today"
        onClick={() => {
          try {
            localStorage.setItem(KEY, today());
          } catch {
            /* ignore */
          }
          setHidden(true);
        }}
      >
        <Icon name="x" size={15} />
      </button>
    </div>
  );
}
