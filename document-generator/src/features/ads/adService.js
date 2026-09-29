/**
 * Advertisement selection.
 *
 * Remote ads come from the cached server configuration (see services/remoteConfig.js).
 * Rules, in order:
 *   1. never while a document is being edited (enforced by AdManager);
 *   2. at most one ad per app session;
 *   3. policy from the server: no ads for the first N days after install,
 *      minimum days between any two ads, maximum ads per month;
 *   4. per ad: date window, target (trial/licensed users, platform, app version),
 *      its own "show again after N days" and monthly maximum;
 *   5. highest priority wins, ties are picked at random.
 *
 * Built-in fallback: if the app has never received a server configuration (for
 * example it is always offline), a built-in DocGen message is shown about every
 * 15 days. It needs no internet connection.
 */

import { call } from '../../services/api.js';
import { getAdState, now, setAdState } from '../../services/remoteConfig.js';
import { monthKey } from '../../utils/dates.js';

const DAY = 86400000;
export const DEFAULT_AD_INTERVAL_DAYS = 15;

/** Built-in ad (id 0). Shown offline; the button opens License & Account. */
export const DEFAULT_AD = {
  id: 0,
  version: 1,
  builtIn: true,
  title: 'Get more from DocGen',
  description: 'Activate DocGen with your account or a license code to use it without limits, on more computers, with priority support.',
  ctaText: 'Activate now',
  action: 'license',
  imageUrl: '',
  html: '',
  linkUrl: '',
};

export const recordAdEvent = (event, ad) =>
  call('ad_event_record', { event, adId: Number(ad.id) || 0, adVersion: String(ad.version ?? '') }).catch(() => {});

/** Compare dotted versions: -1, 0, 1. */
export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0) ? -1 : 1;
  }
  return 0;
}

/** Does `ad` apply to this installation right now? */
export function adMatches(ad, { t, licensed, platform, appVersion, perAd }) {
  if (ad.startAt && t < Date.parse(ad.startAt)) return false;
  if (ad.endAt && t > Date.parse(ad.endAt)) return false;
  const target = ad.target || {};
  if (target.licenseStatus === 'trial' && licensed) return false;
  if (target.licenseStatus === 'licensed' && !licensed) return false;
  if (target.platforms?.length && !target.platforms.includes(platform)) return false;
  if (target.minVersion && compareVersions(appVersion, target.minVersion) < 0) return false;
  if (target.maxVersion && compareVersions(appVersion, target.maxVersion) > 0) return false;
  const mine = perAd?.[ad.id];
  if (mine) {
    if (mine.lastShownAt && t - mine.lastShownAt < Number(ad.frequencyDays || 0) * DAY) return false;
    if (mine.month === monthKey(new Date(t)) && mine.count >= Number(ad.maxPerMonth ?? 31)) return false;
  }
  return true;
}

/**
 * Pure decision function (unit-tested): which ad, if any, to show.
 * @returns {object|null}
 */
export function chooseAd(state, { t, licensed, platform, appVersion, online, random = Math.random }) {
  const config = state.cachedConfig || null;
  const firstOpenAt = Number(state.firstOpenAt || t);
  const month = monthKey(new Date(t));
  const monthlyCount = state.monthlyAdMonth === month ? Number(state.monthlyAdCount || 0) : 0;

  const defaultDue = () => {
    const last = Number(state.defaultAdLastShownAt || 0);
    const since = last || firstOpenAt;
    return t - since >= DEFAULT_AD_INTERVAL_DAYS * DAY;
  };

  if (!config) {
    // Never received a server configuration: built-in fallback only.
    return !licensed && defaultDue() ? DEFAULT_AD : null;
  }

  const policy = config.adPolicy || {};
  if (t - firstOpenAt < Number(policy.firstOpenDelayDays || 0) * DAY) return null;
  const lastShown = Number(state.lastAdShownAt || 0);
  if (lastShown && t - lastShown < Number(policy.minDaysBetweenAds || 0) * DAY) return null;
  if (monthlyCount >= Number(policy.maxPerMonth ?? 4)) return null;

  if (online) {
    const candidates = (config.ads || []).filter((ad) => adMatches(ad, { t, licensed, platform, appVersion, perAd: state.adShown || {} }));
    if (candidates.length) {
      const top = Math.max(...candidates.map((a) => Number(a.priority || 0)));
      const best = candidates.filter((a) => Number(a.priority || 0) === top);
      return best[Math.floor(random() * best.length)] || best[0];
    }
  }
  if (config.defaultAdEnabled !== false && !licensed && defaultDue()) return DEFAULT_AD;
  return null;
}

/** Read local state, record first open, and decide. */
export async function pickAdToShow({ licensed, platform, appVersion }) {
  const t = now();
  const state = await getAdState();
  if (!state.firstOpenAt) {
    await setAdState({ firstOpenAt: t });
    state.firstOpenAt = t;
  }
  return chooseAd(state, { t, licensed, platform, appVersion, online: typeof navigator === 'undefined' || navigator.onLine !== false });
}

/** Update counters after an ad was displayed. */
export async function markAdShown(ad) {
  const t = now();
  const month = monthKey(new Date(t));
  const state = await getAdState();
  const count = state.monthlyAdMonth === month ? Number(state.monthlyAdCount || 0) : 0;
  const values = { lastAdShownAt: t, monthlyAdCount: count + 1, monthlyAdMonth: month };
  if (ad.builtIn) {
    values.defaultAdLastShownAt = t;
  } else {
    const perAd = { ...(state.adShown || {}) };
    const mine = perAd[ad.id] && perAd[ad.id].month === month ? perAd[ad.id] : { month, count: 0 };
    perAd[ad.id] = { lastShownAt: t, month, count: mine.count + 1 };
    values.adShown = perAd;
  }
  await setAdState(values);
  await recordAdEvent('AD_SHOWN', ad);
}
