/**
 * Remember which ad or campaign brought a visitor, and send it with the sign-up.
 *
 * Tag ad links like:  https://docgen.reynrel.in/?utm_source=google&utm_medium=cpc&utm_campaign=gst-invoice
 * Google Ads (gclid) and Facebook/Instagram (fbclid) clicks are recognised automatically.
 * A newer ad click replaces an older one; plain visits never overwrite a stored ad click.
 */

const KEY = 'docgen.attribution';
const PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
const MAX_AGE_DAYS = 60;

function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (stored && Date.now() - Date.parse(stored.at) < MAX_AGE_DAYS * 86400000) return stored;
  } catch {
    /* storage unavailable */
  }
  return null;
}

function write(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Referral links: /r/<code> on the server redirects to /?ref=<code>. The code is kept in Local Storage for
 * 30 days (a newer referral link replaces it) and sent with sign-up and checkout; the server saves it with the
 * new account and the order, so the admin panel never depends on this browser.
 */
const REF_KEY = 'docgen.referral';
const REF_DAYS = 30;

export function getReferralCode() {
  try {
    const stored = JSON.parse(localStorage.getItem(REF_KEY) || 'null');
    if (stored?.code && Date.now() - Date.parse(stored.at) < REF_DAYS * 86400000) return stored.code;
    if (stored) localStorage.removeItem(REF_KEY);
  } catch {
    /* storage unavailable */
  }
  return '';
}

function captureReferral(url) {
  const code = (url.searchParams.get('ref') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  if (code.length < 4) return;
  try {
    localStorage.setItem(REF_KEY, JSON.stringify({ code, at: new Date().toISOString() }));
  } catch {
    /* storage unavailable */
  }
  // Tidy the address bar (the code is stored).
  url.searchParams.delete('ref');
  try {
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* ignore */
  }
}

/** Call once when the page loads. */
export function captureAttribution() {
  const url = new URL(window.location.href);
  captureReferral(url);
  const tags = Object.fromEntries(PARAMS.map((p) => [p, url.searchParams.get(p) || '']).filter(([, v]) => v));
  let referrer = '';
  try {
    if (document.referrer && new URL(document.referrer).host !== window.location.host) referrer = document.referrer.slice(0, 300);
  } catch {
    /* invalid referrer */
  }
  const landing = `${url.pathname}${url.search}`.slice(0, 300);
  if (Object.keys(tags).length) write({ ...tags, landing, referrer, at: new Date().toISOString() });
  else if (!read() && referrer) write({ landing, referrer, at: new Date().toISOString() });
}

/** What to send with the registration (empty object when unknown). */
export function getAttribution() {
  const { at: _at, ...rest } = read() || {};
  const ref = getReferralCode();
  return ref ? { ...rest, ref_code: ref } : rest;
}
