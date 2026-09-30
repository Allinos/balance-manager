/**
 * Razorpay (India): cards, UPI, netbanking, wallets.
 *
 * Enabled when RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set. Flow:
 *   1. POST /api/portal/checkout creates a Razorpay order for the plan price (amount fixed by the server).
 *   2. The portal opens Razorpay Checkout with that order.
 *   3. The portal posts Razorpay's response to /api/portal/payments/:id/confirm; the signature
 *      HMAC_SHA256(order_id|payment_id, key_secret) proves the payment belongs to our order.
 *   4. Razorpay also calls POST /api/payments/webhook/razorpay (set it up in the Razorpay dashboard with
 *      the events payment.captured, order.paid and payment.failed and RAZORPAY_WEBHOOK_SECRET), so the
 *      license is issued even if the customer closes the browser right after paying.
 */

import crypto from 'node:crypto';
import { config } from '../config.js';
import { ApiError } from '../lib/http.js';

const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function razorpayApi(method, path, body) {
  const { keyId, keySecret, apiBase } = config.razorpay;
  let res;
  try {
    res = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(502, 'PAYMENT_GATEWAY_UNREACHABLE', 'The payment gateway could not be reached. Please try again in a minute.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(502, 'PAYMENT_GATEWAY_ERROR', `The payment gateway refused the order: ${data?.error?.description || res.status}`);
  }
  return data;
}

export const razorpay = {
  name: 'razorpay',
  label: 'UPI, cards, netbanking & wallets (Razorpay)',

  async createOrder({ payment, plan, client }) {
    const order = await razorpayApi('POST', '/v1/orders', {
      amount: payment.amount_paise,
      currency: payment.currency,
      receipt: `docgen-${payment.id}`,
      notes: { paymentId: String(payment.id), clientId: String(client.id), plan: plan.code },
    });
    return {
      providerOrderId: order.id,
      checkout: {
        type: 'razorpay',
        keyId: config.razorpay.keyId,
        orderId: order.id,
        amount: payment.amount_paise,
        currency: payment.currency,
        name: 'DocGen',
        description: `${plan.name} plan`,
        prefill: { name: client.name, email: client.email, contact: client.phone || '' },
      },
    };
  },

  /** Response of Razorpay Checkout: { razorpay_payment_id, razorpay_order_id, razorpay_signature }. */
  async verifyConfirmation({ payment, body }) {
    const orderId = body.razorpay_order_id;
    const paymentId = body.razorpay_payment_id;
    if (!orderId || !paymentId || orderId !== payment.provider_order_id) {
      throw new ApiError(400, 'PAYMENT_MISMATCH', 'This payment does not belong to the order. Please contact support.');
    }
    if (!safeEqual(hmac(config.razorpay.keySecret, `${orderId}|${paymentId}`), body.razorpay_signature)) {
      throw new ApiError(400, 'INVALID_SIGNATURE', 'The payment could not be verified. If money was deducted, it will be confirmed automatically or refunded.');
    }
    return { paid: true, providerPaymentId: paymentId, meta: { razorpayOrderId: orderId } };
  },

  async parseWebhook(req) {
    const secret = config.razorpay.webhookSecret;
    if (!secret) throw new ApiError(400, 'WEBHOOK_NOT_CONFIGURED', 'RAZORPAY_WEBHOOK_SECRET is not set.');
    if (!req.rawBody || !safeEqual(hmac(secret, req.rawBody), req.headers['x-razorpay-signature'])) {
      throw new ApiError(400, 'INVALID_SIGNATURE', 'Invalid webhook signature.');
    }
    const { event, payload } = req.body || {};
    const pay = payload?.payment?.entity;
    const order = payload?.order?.entity;
    const providerOrderId = pay?.order_id || order?.id || '';
    const meta = { event, method: pay?.method || '' };
    if (event === 'payment.captured' || event === 'order.paid') {
      return { providerOrderId, providerPaymentId: pay?.id || null, status: 'paid', amountPaise: pay?.amount ?? order?.amount_paid, meta };
    }
    if (event === 'payment.failed') {
      return { providerOrderId, providerPaymentId: pay?.id || null, status: 'failed', meta: { ...meta, reason: pay?.error_description || '' } };
    }
    return { providerOrderId, status: 'ignored', meta };
  },
};
