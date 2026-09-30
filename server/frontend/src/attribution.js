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

/** Call once when the page loads. */
export function captureAttribution() {
  const url = new URL(window.location.href);
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
  return rest;
}
