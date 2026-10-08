/**
 * Meta Pixel (Facebook / Instagram ads) on the website.
 *
 *   PageView          every public page (not the admin panel)
 *   ViewContent       /offer and /buy, with the price shown
 *   InitiateCheckout  "Pay now" / "Continue to payment" with valid details
 *   Purchase          after a successful payment, with the amount paid
 *
 * The Pixel ID and the on/off switch come from Admin → Website → Meta Pixel. The Purchase carries the event id
 * `purchase-<payment id>`; the server sends the same event through the Conversions API (backend services/meta.js)
 * and Meta counts it once.
 */

import { clientApi } from './api.js';

let loading = null;

/** Load the Pixel once (when switched on). Resolves to true when `fbq` can be used. */
export function ensurePixel() {
  if (!loading) {
    loading = clientApi
      .get('/site')
      .then(({ site }) => {
        const cfg = site?.metaPixel || {};
        if (!cfg.enabled || !/^\d{8,20}$/.test(cfg.pixelId || '')) return false;
        install(cfg.pixelId);
        return true;
      })
      .catch(() => false);
  }
  return loading;
}

/** Meta's standard base code, without inline script (the site's Content-Security-Policy forbids it). */
function install(pixelId) {
  if (window.fbq) return;
  const fbq = function (...args) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);
  fbq('init', pixelId);
}

/**
 * Send a standard event. `eventId` lets Meta match it with the server's copy (Purchase).
 * @param {string} event  PageView, ViewContent, InitiateCheckout, Purchase
 */
export function track(event, params, eventId) {
  ensurePixel().then((ok) => {
    if (!ok || !window.fbq) return;
    if (eventId) window.fbq('track', event, params || {}, { eventID: eventId });
    else if (params) window.fbq('track', event, params);
    else window.fbq('track', event);
  });
}

/** The Pixel's cookies (_fbp: this browser, _fbc: the ad click), sent with the checkout for the Conversions API. */
export function pixelCookies() {
  const get = (name) => document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) || '';
  return { fbp: get('_fbp'), fbc: get('_fbc'), path: window.location.pathname };
}

/** Purchase / checkout parameters for a product and price. */
export const saleParams = (product, price) => ({
  value: Number(price.price),
  currency: product.currency || 'INR',
  content_type: 'product',
  content_ids: [String(product.code || product.id)],
  content_name: product.name,
  num_items: 1,
});
