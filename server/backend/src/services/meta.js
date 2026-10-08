/**
 * Meta Conversions API: every paid order is sent to Meta from the server as a Purchase event, so Facebook /
 * Instagram ads see the sale even when an ad blocker or the browser stopped the Pixel. The browser sends the
 * same Purchase with the same event id (`purchase-<payment id>`), and Meta counts it once.
 *
 * Needs META_CAPI_TOKEN in server/.env (secret, never sent to the browser) and the Pixel ID in
 * Admin → Website → Meta Pixel. Email, phone and customer id are SHA-256 hashed as Meta requires.
 */

import crypto from 'node:crypto';
import { config } from '../config.js';
import { parseJson } from '../db.js';
import { getSiteConfig } from './common.js';

/** A Pixel ID as stored in Admin → Website (digits only). */
export const validPixelId = (id) => /^\d{8,20}$/.test(String(id || ''));

/**
 * Meta's Pixel base code as a script file (/meta-pixel.js), so it runs under the site's Content-Security-Policy
 * (no inline scripts). It loads fbevents.js and calls init; the website itself sends PageView and the other events.
 */
export const pixelScript = (pixelId) => `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
`;

/** Add the Pixel to a page's HTML: the base code in <head> and Meta's <noscript> image (seen by Meta's checks). */
export function withPixel(html, pixelId) {
  if (!validPixelId(pixelId)) return html;
  const head = `<script src="/meta-pixel.js"></script>`;
  const noscript = `<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${pixelId}&amp;ev=PageView&amp;noscript=1"></noscript>`;
  return html.replace('</head>', `    ${head}\n  </head>`).replace(/<body([^>]*)>/, `<body$1>\n    ${noscript}`);
}

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

/** Meta's normalisation: email lower-case; phone digits only with the country code (India by default). */
export const hashEmail = (email) => (email ? sha256(String(email).trim().toLowerCase()) : undefined);
export function hashPhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return undefined;
  if (digits.length === 10) digits = `91${digits}`;
  return sha256(digits);
}

/** The event id shared by the browser Pixel and the server, so Meta keeps one of the two. */
export const purchaseEventId = (paymentId) => `purchase-${paymentId}`;

/**
 * Build the Purchase event for a paid payment.
 * @param {{payment: Object, client: Object, plan: Object}} p  payment.meta.track: { ip, ua, fbp, fbc, path } saved at checkout
 */
export function purchaseEvent({ payment, client, plan }) {
  const meta = parseJson(payment.meta, {});
  const track = meta.track || {};
  const details = parseJson(client?.ref_details, {});
  // _fbc cookie from the browser, otherwise built from the ad click id saved when the customer arrived.
  const fbc = track.fbc || (details.fbclid ? `fb.1.${Date.parse(client.created_at) || Date.now()}.${details.fbclid}` : undefined);
  const paidAt = Date.parse(payment.paid_at) || Date.now();
  const userData = {
    em: hashEmail(client?.email),
    ph: hashPhone(client?.phone),
    external_id: client?.id ? sha256(String(client.id)) : undefined,
    client_ip_address: track.ip || undefined,
    client_user_agent: track.ua || undefined,
    fbp: track.fbp || undefined,
    fbc,
  };
  return {
    event_name: 'Purchase',
    event_time: Math.floor(paidAt / 1000),
    event_id: purchaseEventId(payment.id),
    action_source: 'website',
    event_source_url: `${config.portalUrl}${track.path || '/buy'}`,
    user_data: Object.fromEntries(Object.entries(userData).filter(([, v]) => v)),
    custom_data: {
      currency: payment.currency || 'INR',
      value: Number(payment.amount_paise || 0) / 100,
      content_type: 'product',
      content_ids: [String(plan?.code || payment.plan_id)],
      content_name: plan?.name || 'DocGen',
      num_items: 1,
      order_id: String(payment.id),
    },
  };
}

/**
 * Send the Purchase of a newly paid payment. Never throws: a failure is logged and the sale goes on.
 * @returns {Promise<'sent'|'skipped'|'failed'>}
 */
export async function sendPurchase(knex, payment) {
  const site = await getSiteConfig(knex);
  const pixel = site.metaPixel || {};
  if (!config.meta.capiToken || !pixel.enabled || !pixel.pixelId) return 'skipped';
  try {
    const [client, plan] = await Promise.all([
      knex('clients').where({ id: payment.client_id }).first(),
      knex('plans').where({ id: payment.plan_id }).first(),
    ]);
    const body = { data: [purchaseEvent({ payment, client, plan })], access_token: config.meta.capiToken };
    if (config.meta.testEventCode) body.test_event_code = config.meta.testEventCode;
    const res = await fetch(`${config.meta.graphBase}/${config.meta.graphVersion}/${pixel.pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      console.error(`Meta Conversions API: payment ${payment.id} not sent (${res.status}) ${text}`);
      return 'failed';
    }
    return 'sent';
  } catch (e) {
    console.error(`Meta Conversions API: payment ${payment.id} not sent: ${e.message}`);
    return 'failed';
  }
}
