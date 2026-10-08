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
