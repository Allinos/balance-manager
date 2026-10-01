import { useAppData } from '../../hooks/useAppData.jsx';

/** Same as the license shown in the sidebar when this many days or fewer remain. */
const SHOW_LICENSE_DAYS = 30;

/**
 * Thin line with the remaining days: of the 30-day period, or of the license
 * once it has 30 days or fewer left (amber). Nothing else.
 */
export default function TrialLine() {
  const { license } = useAppData();
  const daysLeft = license?.license?.daysLeft;
  if (license?.licensed && daysLeft !== null && daysLeft !== undefined && daysLeft <= SHOW_LICENSE_DAYS) {
    const left = Math.max(0, daysLeft);
    return (
      <div className="trial-line license-ending" title={`Your license ends in ${left} ${left === 1 ? 'day' : 'days'}. Renew it in your account.`} data-testid="license-line">
        <span className="trial-line-bar">
          <span style={{ width: `${Math.min(100, (left / SHOW_LICENSE_DAYS) * 100)}%` }} />
        </span>
        <span className="trial-line-days">
          {left} {left === 1 ? 'Day' : 'Days'}
        </span>
      </div>
    );
  }
  if (license?.mode !== 'trial') return null;
  const left = Math.max(0, license.trialDaysLeft);
  const pct = Math.min(100, (left / (license.trialDays || 30)) * 100);
  return (
    <div className="trial-line" title={`${left} ${left === 1 ? 'day' : 'days'} remaining`} data-testid="trial-line">
      <span className="trial-line-bar">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="trial-line-days">
        {left} {left === 1 ? 'Day' : 'Days'}
      </span>
    </div>
  );
}
