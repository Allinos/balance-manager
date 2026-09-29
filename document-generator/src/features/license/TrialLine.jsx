import { useAppData } from '../../hooks/useAppData.jsx';

/** Thin green line with the remaining days of the 30-day period. Nothing else. */
export default function TrialLine() {
  const { license } = useAppData();
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
