/**
 * Advertisement selection.
 *
 * Remote ads come from the cached server configuration (see services/remoteConfig.js).
 * Rules, in order:
 *   1. never while a document is being edited (enforced by AdManager);
 *   2. ad-free for the first 15 days after the app is first started and after a license is
 *      activated (AD_FREE_DAYS; the server may make this longer, never shorter);
 *   3. at most one ad per app session, at least 15 days between two ads (MIN_DAYS_BETWEEN_ADS) and
 *      at most 2 in a calendar month (MAX_ADS_PER_MONTH); the server may make these stricter;
 *   4. per ad: date window, target (trial/licensed users, platform, app version),
 *      its own "show again after N days" and monthly maximum;
 *   5. highest priority wins, ties are picked at random.
 *
 * Missed ads never pile up: nothing is queued while the app is closed or offline. The decision is
 * made fresh each time the app starts and returns at most ONE ad — the one that applies now. After
 * three months closed the user sees one ad, not five.
 *
 * Built-in ads (no internet needed): when the app has never received a server configuration
 * (for example it is always offline), or it is offline / has no server ad to show, the built-in
 * ads take turns: reynrel.in's billing software, POS billing and services (HOUSE_ADS), plus — for
 * copies without a license — "Activate DocGen". The server can switch them off (defaultAdEnabled: false).
 */

import { call } from '../../services/api.js';
import { getAdState, now, setAdState } from '../../services/remoteConfig.js';
import { monthKey } from '../../utils/dates.js';

const DAY = 86400000;
/** No ads in the first 15 days after the first start and after a license is activated. */
export const AD_FREE_DAYS = 15;
/** At least 15 days between two ads (built-in or from the server). */
export const MIN_DAYS_BETWEEN_ADS = 15;
export const DEFAULT_AD_INTERVAL_DAYS = MIN_DAYS_BETWEEN_ADS;
/** Never more than two ads in a calendar month (the server may set fewer). */
export const MAX_ADS_PER_MONTH = 2;

/** Built-in ad (id 0). Shown offline; the button opens License & Account. */
export const DEFAULT_AD = {
  id: 0,
  version: 1,
  builtIn: true,
  title: 'Get more from DocGen',
  description: 'Activate DocGen with your account or a license code to use it without limits, on more computers, with priority support.',
  ctaText: 'Activate now',
  action: 'license',
  icon: 'key',
  imageUrl: '',
  html: '',
  linkUrl: '',
};

const UTM = 'utm_source=docgen-desktop&utm_medium=app&utm_campaign=house-ad';

/**
 * reynrel.in's own products and services, shown in turn every 15 days. Edit the texts and links here.
 * `image`: a picture bundled with the app (see AdManager); without one, `icon` is shown on a coloured band.
 */
export const HOUSE_ADS = [
  {
    id: 0,
    version: 'billing-1',
    builtIn: true,
    image: 'billing',
    title: 'Billing & inventory software for shops and distributors',
    description:
      'Retail POS, B2B and B2C billing, stock across warehouses, purchases, barcodes, customer dues and GST reports — with a clear dashboard of your sales. By reynrel.in.',
    ctaText: 'See the billing software',
    linkUrl: `https://reynrel.in/?${UTM}&utm_content=billing`,
  },
  {
    id: 0,
    version: 'pos-1',
    builtIn: true,
    image: 'pos',
    title: 'Fast POS billing for cafés, restaurants and salons',
    description:
      'Tap items to bill in seconds, hold and resume orders, takeaway and parcel, expenses, employees and daily reports. Works on a computer or tablet. By reynrel.in.',
    ctaText: 'See the POS software',
    linkUrl: `https://reynrel.in/?${UTM}&utm_content=pos`,
  },
  {
    id: 0,
    version: 'web-1',
    builtIn: true,
    image: '',
    icon: 'globe',
    title: 'Get a professional website for your business',
    description: 'reynrel.in designs fast, mobile-friendly websites so customers find you on Google — with WhatsApp and call buttons, your products and location.',
    ctaText: 'Talk to reynrel.in',
    linkUrl: `https://reynrel.in/?${UTM}&utm_content=website`,
  },
  {
    id: 0,
    version: 'software-1',
    builtIn: true,
    image: '',
    icon: 'tool',
    title: 'Custom software and mobile apps',
    description: 'Need something made for the way you work — an app for your staff, an online ordering system or automation? reynrel.in builds software for small businesses.',
    ctaText: 'Discuss your idea',
    linkUrl: `https://reynrel.in/?${UTM}&utm_content=custom-software`,
  },
  {
    id: 0,
    version: 'marketing-1',
    builtIn: true,
    image: '',
    icon: 'sparkle',
    title: 'Bring more customers with Google & social media ads',
    description: 'reynrel.in sets up and runs Google, Facebook and Instagram ads and your Google Business profile, so nearby customers find your business.',
    ctaText: 'Grow my business',
    linkUrl: `https://reynrel.in/?${UTM}&utm_content=marketing`,
  },
];

/** The built-in ads for this copy, in the order they take turns. */
export const builtInAds = (licensed) => (licensed ? HOUSE_ADS : [DEFAULT_AD, ...HOUSE_ADS]);

/** The next built-in ad in turn. */
export const nextBuiltInAd = (state, licensed) => {
  const ads = builtInAds(licensed);
  return ads[Number(state.defaultAdIndex || 0) % ads.length];
};

// Built-in ads have id 0: their counters stay on this computer (never sent to the server).
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
export function chooseAd(state, { t, licensed, licenseStartedAt = 0, platform, appVersion, online, random = Math.random }) {
  const config = state.cachedConfig || null;
  const policy = config?.adPolicy || {};
  const month = monthKey(new Date(t));
  const monthlyCount = state.monthlyAdMonth === month ? Number(state.monthlyAdCount || 0) : 0;

  // Ad-free start: 15 days after the first start of the app and after the license was activated.
  const firstOpenAt = Number(state.firstOpenAt || t);
  const startedAt = Math.max(firstOpenAt, Number(licenseStartedAt) || 0);
  if (t - startedAt < Math.max(AD_FREE_DAYS, Number(policy.firstOpenDelayDays || 0)) * DAY) return null;

  // At least 15 days since the last ad of any kind. A clock set back (last ad "in the future") also waits.
  const lastShown = Math.max(Number(state.lastAdShownAt || 0), Number(state.defaultAdLastShownAt || 0));
  if (lastShown && t - lastShown < Math.max(MIN_DAYS_BETWEEN_ADS, Number(policy.minDaysBetweenAds || 0)) * DAY) return null;

  if (monthlyCount >= Math.min(MAX_ADS_PER_MONTH, Number(policy.maxPerMonth ?? MAX_ADS_PER_MONTH))) return null;

  // Never received a server configuration: built-in ads only.
  if (!config) return nextBuiltInAd(state, licensed);

  if (online) {
    const candidates = (config.ads || []).filter((ad) => adMatches(ad, { t, licensed, platform, appVersion, perAd: state.adShown || {} }));
    if (candidates.length) {
      const top = Math.max(...candidates.map((a) => Number(a.priority || 0)));
      const best = candidates.filter((a) => Number(a.priority || 0) === top);
      return best[Math.floor(random() * best.length)] || best[0];
    }
  }
  return config.defaultAdEnabled !== false ? nextBuiltInAd(state, licensed) : null;
}

/** Read local state, record first open, and decide. */
export async function pickAdToShow({ licensed, licenseStartedAt, platform, appVersion }) {
  const t = now();
  const state = await getAdState();
  if (!state.firstOpenAt) {
    await setAdState({ firstOpenAt: t });
    state.firstOpenAt = t;
  }
  return chooseAd(state, { t, licensed, licenseStartedAt, platform, appVersion, online: typeof navigator === 'undefined' || navigator.onLine !== false });
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
    values.defaultAdIndex = Number(state.defaultAdIndex || 0) + 1;
  } else {
    const perAd = { ...(state.adShown || {}) };
    const mine = perAd[ad.id] && perAd[ad.id].month === month ? perAd[ad.id] : { month, count: 0 };
    perAd[ad.id] = { lastShownAt: t, month, count: mine.count + 1 };
    values.adShown = perAd;
  }
  await setAdState(values);
  await recordAdEvent('AD_SHOWN', ad);
}
