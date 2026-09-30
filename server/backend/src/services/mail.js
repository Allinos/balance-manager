/**
 * Emails to customers: payment receipt (with activation code and download link) and password reset.
 *
 * Configure SMTP_URL (e.g. smtps://user:password@smtp.zoho.in:465) and MAIL_FROM. Without SMTP_URL
 * nothing is sent (the portal still shows codes and downloads); in tests messages are kept in `outbox`.
 */

import nodemailer from 'nodemailer';
import { config } from '../config.js';

/** Messages "sent" during tests. */
export const outbox = [];

let transport = null;
function getTransport() {
  if (transport) return transport;
  if (config.isTest) transport = nodemailer.createTransport({ jsonTransport: true });
  else if (config.smtpUrl) transport = nodemailer.createTransport(config.smtpUrl);
  return transport;
}

export const mailEnabled = () => !!(config.smtpUrl || config.isTest);

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Plain paragraphs + optional button → simple, mail-client-safe HTML. */
function layout(paragraphs, button) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
  const cta = button
    ? `<p style="margin:22px 0"><a href="${escapeHtml(button.url)}" style="background:#224cc8;color:#fff;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(button.label)}</a></p>`
    : '';
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#1f2937;max-width:560px">
<p style="font-size:20px;font-weight:700;margin:0 0 18px"><span style="color:#224cc8">Doc</span><span style="color:#d8943e">Gen</span></p>
${body}${cta}
<p style="color:#6b7280;font-size:13px;margin-top:28px">Questions? Reply to this email or write to ${escapeHtml(config.supportEmail)}.<br>DocGen · a product of reynrel.in</p></div>`;
}

export async function sendMail({ to, subject, paragraphs, button }) {
  const t = getTransport();
  if (!t) return false;
  const text = [...paragraphs, button ? `${button.label}: ${button.url}` : ''].filter(Boolean).join('\n\n');
  const message = { from: config.mailFrom, replyTo: config.supportEmail, to, subject, text, html: layout(paragraphs, button) };
  await t.sendMail(message);
  if (config.isTest) outbox.push(message);
  return true;
}

const money = (paise, currency) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR' }).format(paise / 100);
const day = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export async function sendPaymentReceipt(knex, payment, license) {
  if (!mailEnabled()) return false;
  const client = await knex('clients').where({ id: payment.client_id }).first();
  const plan = await knex('plans').where({ id: payment.plan_id }).first();
  if (!client) return false;
  const validity =
    !license.expires_at && license.duration_days === 0
      ? 'Lifetime'
      : license.expires_at
        ? `until ${day(license.expires_at)}`
        : `${license.duration_days} days from the first activation`;
  return sendMail({
    to: client.email,
    subject: `Payment received — your DocGen ${plan?.name || ''} license`.replace(/\s+/g, ' '),
    paragraphs: [
      `Hi ${client.name},`,
      `Thank you! We received ${money(payment.amount_paise, payment.currency)} for the DocGen ${plan?.name || ''} plan (order #${payment.id}).`,
      `Activation code: ${license.code}\nValid: ${validity} · Computers: ${license.max_devices}`,
      'Download DocGen from your account, install it, then choose "Login Using Your Account" (same email and password) or "I Have a License" and enter the code above.',
    ],
    button: { label: 'Download DocGen', url: `${config.portalUrl}/account` },
  });
}

export async function sendPasswordReset(client, link) {
  return sendMail({
    to: client.email,
    subject: 'Reset your DocGen password',
    paragraphs: [
      `Hi ${client.name},`,
      'We received a request to reset the password of your DocGen account. The link below works for 1 hour.',
      'If you did not ask for this, you can ignore this email — your password stays the same.',
    ],
    button: { label: 'Choose a new password', url: link },
  });
}
