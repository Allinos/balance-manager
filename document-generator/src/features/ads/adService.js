/**
 * Advertisement scheduling.
 *
 *   App opens → read local ad state → refresh remote config only if the fetch
 *   interval has passed and we are online (otherwise keep the cached config) →
 *   ads enabled? → inside start/end window? → first-open delay passed? →
 *   minimum days since last ad passed? → monthly limit not reached? →
 *   optional randomisation → show.
 *
 * Nothing about documents, customers, products or the company is ever read or
 * sent here. Remote config is validated by the Rust side before it reaches us.
 */

import { call } from '../../services/api.js';
import { monthKey, daysBetween } from '../../utils/dates.js';

const DEFAULT_FETCH_INTERVAL_DAYS = 7;
/** After a failed fetch wait this long before trying again (prevents excessive requests). */
const RETRY_AFTER_FAILURE_DAYS = 1;

const getState = () => call('ad_state_get');
const setState = (values) => call('ad_state_set', { values });

export const recordAdEvent = (event, adVersion) =>
  call('ad_event_record', { event, adVersion: String(adVersion || '') }).catch(() => {});

async function refreshConfigIfDue(state, now) {
  const cached = state.cachedConfig || null;
  const interval = Number(cached?.fetchIntervalDays) || DEFAULT_FETCH_INTERVAL_DAYS;
  const lastFetch = Number(state.lastConfigFetchAt || 0);
  const lastAttempt = Number(state.lastConfigAttemptAt || 0);
  const fetchDue = !lastFetch || daysBetween(lastFetch, now) >= interval;
  const retryAllowed = !lastAttempt || daysBetween(lastAttempt, now) >= RETRY_AFTER_FAILURE_DAYS;
  if (!fetchDue || !retryAllowed || !navigator.onLine) return cached;

  await setState({ lastConfigAttemptAt: now });
  try {
    const config = await call('remote_config_fetch');
    await setState({ cachedConfig: config, lastConfigFetchAt: now, lastConfigVersion: config.version });
    return config;
  } catch {
    // Server down or offline: silently keep using the last valid configuration.
    return cached;
  }
}

/**
 * Decide whether an ad should be shown now.
 * @returns {Promise<null | {contentUrl: string, clickUrl: string, title: string, ctaText: string, adVersion: string}>}
 */
export async function pickAdToShow() {
  const now = Date.now();
  const state = await getState();

  // Reset the monthly counter at the start of each calendar month.
  const month = monthKey();
  let monthlyCount = Number(state.monthlyAdCount || 0);
  if (state.monthlyAdMonth !== month) {
    monthlyCount = 0;
    await setState({ monthlyAdMonth: month, monthlyAdCount: 0 });
  }
  if (!state.firstOpenAt) await setState({ firstOpenAt: now });
  const firstOpenAt = Number(state.firstOpenAt || now);

  const config = await refreshConfigIfDue(state, now);
  const ads = config?.ads;
  if (!ads || !ads.enabled || !ads.contentUrl) return null;

  if (ads.startAt && now < Date.parse(ads.startAt)) return null;
  if (ads.endAt && now > Date.parse(ads.endAt)) return null;
  if (daysBetween(firstOpenAt, now) < Number(ads.firstOpenDelayDays || 0)) return null;

  const lastShown = Number(state.lastAdShownAt || 0);
  if (lastShown && daysBetween(lastShown, now) < Number(ads.minimumDaysBetweenAds || 0)) return null;
  if (monthlyCount >= Number(ads.monthlyLimit || 0)) return null;
  if (!navigator.onLine) return null; // ad content itself is remote
  if (ads.randomize && Math.random() > Number(ads.probability ?? 0.5)) return null;

  return ads;
}

/** Record that an ad was displayed (updates local counters and logs AD_SHOWN). */
export async function markAdShown(ad) {
  const state = await getState();
  const month = monthKey();
  const count = state.monthlyAdMonth === month ? Number(state.monthlyAdCount || 0) : 0;
  await setState({ lastAdShownAt: Date.now(), monthlyAdCount: count + 1, monthlyAdMonth: month });
  await recordAdEvent('AD_SHOWN', ad.adVersion);
}
