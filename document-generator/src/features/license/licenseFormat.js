/** Formatting helpers for license screens. */

export const date = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** Short text for the sidebar chip / banner. */
export function licenseSummary(license) {
  if (!license) return { tone: 'muted', text: '' };
  if (license.licensed) {
    const l = license.license || {};
    if (l.daysLeft !== null && l.daysLeft !== undefined && l.daysLeft <= 15) {
      return { tone: 'warn', text: `License ends in ${l.daysLeft} ${l.daysLeft === 1 ? 'day' : 'days'}` };
    }
    return { tone: 'good', text: l.planName ? `${l.planName} plan` : 'Licensed' };
  }
  if (license.mode === 'trial') {
    const d = license.trialDaysLeft;
    return { tone: d <= 7 ? 'warn' : 'info', text: `Trial · ${d} ${d === 1 ? 'day' : 'days'} left` };
  }
  return { tone: 'bad', text: 'Trial ended' };
}
