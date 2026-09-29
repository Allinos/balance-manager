/**
 * Payment provider registry.
 *
 * DocGen does not depend on a specific payment gateway. A provider is a small
 * object implementing this interface (see docs/SERVER.md → "Connecting a payment provider"):
 *
 *   {
 *     name: 'razorpay',
 *     // Create an order at the gateway. Return data the portal needs to open checkout.
 *     async createOrder({ payment, plan, client }) → { providerOrderId, checkout: {...} },
 *     // Verify a payment confirmation posted by the portal after checkout (signature check etc.).
 *     async verifyConfirmation({ payment, body }) → { paid: boolean, providerPaymentId, meta },
 *     // Verify and parse a server-to-server webhook.
 *     async parseWebhook(req) → { providerOrderId, providerPaymentId, status: 'paid'|'failed', meta },
 *   }
 *
 * Built in:
 *   - mock   : instant test payments for development/testing (disabled in production by default)
 *   - manual : bank transfer / UPI / cash; an admin marks the payment as paid in the admin panel
 */

import crypto from 'node:crypto';
import { config } from '../config.js';
import { ApiError } from '../lib/http.js';

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

const providers = new Map([[manual.name, manual]]);
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
