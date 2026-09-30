/**
 * Payment provider registry.
 *
 * DocGen does not depend on a specific payment gateway. A provider is a small
 * object implementing this interface (see server/README.md → "Connecting a payment provider"):
 *
 *   {
 *     name: 'razorpay',
 *     // Create an order at the gateway. Return data the portal needs to open checkout.
 *     async createOrder({ payment, plan, client }) → { providerOrderId, checkout: {...} },
 *     // Verify a payment confirmation posted by the portal after checkout (signature check etc.).
 *     async verifyConfirmation({ payment, body }) → { paid: boolean, providerPaymentId, meta },
 *     // Verify and parse a server-to-server webhook.
 *     async parseWebhook(req) → { providerOrderId, providerPaymentId, status: 'paid'|'failed'|'ignored', amountPaise?, meta },
 *   }
 *
 * Built in:
 *   - razorpay : UPI, cards, netbanking, wallets — when RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are set
 *   - manual   : bank transfer / UPI / cash; an admin marks the payment as paid in the admin panel
 *   - mock     : instant test payments, only with ENABLE_MOCK_PAYMENTS=true (never in production)
 */

import crypto from 'node:crypto';
import { config } from '../config.js';
import { ApiError } from '../lib/http.js';
import { razorpay } from './razorpay.js';

const mock = {
  name: 'mock',
  label: 'Test payment (development only)',
  async createOrder({ payment }) {
    return { providerOrderId: `mock_order_${payment.id}_${crypto.randomBytes(4).toString('hex')}`, checkout: { type: 'mock' } };
  },
  async verifyConfirmation({ body }) {
    const outcome = body?.outcome === 'fail' ? 'failed' : 'paid';
    return { paid: outcome === 'paid', providerPaymentId: `mock_pay_${crypto.randomBytes(6).toString('hex')}`, meta: { outcome } };
  },
  async parseWebhook(req) {
    const { orderId, status } = req.body || {};
    return { providerOrderId: String(orderId || ''), providerPaymentId: `mock_hook_${Date.now()}`, status: status === 'failed' ? 'failed' : 'paid', meta: {} };
  },
};

const manual = {
  name: 'manual',
  label: 'Bank transfer / UPI (confirmed by our team)',
  async createOrder({ payment }) {
    return {
      providerOrderId: `manual_${payment.id}`,
      checkout: {
        type: 'manual',
        instructions:
          'Pay by bank transfer or UPI and mention your order number. Your license is activated as soon as our team confirms the payment.',
      },
    };
  },
  async verifyConfirmation() {
    return { paid: false, providerPaymentId: null, meta: { awaiting: 'admin confirmation' } };
  },
  async parseWebhook() {
    throw new ApiError(400, 'NOT_SUPPORTED', 'Manual payments have no webhook.');
  },
};

// Order = order shown at checkout; the first online provider is preselected.
const providers = new Map();
if (config.razorpay.keyId && config.razorpay.keySecret) providers.set(razorpay.name, razorpay);
providers.set(manual.name, manual);
if (config.enableMockPayments) providers.set(mock.name, mock);

/** Register an additional provider (call from src/index.js once you add one). */
export function registerProvider(provider) {
  providers.set(provider.name, provider);
}

export function getProvider(name) {
  const p = providers.get(name);
  if (!p) throw new ApiError(400, 'UNKNOWN_PROVIDER', 'This payment method is not available.');
  return p;
}

export const listProviders = () => [...providers.values()].map((p) => ({ name: p.name, label: p.label }));
