/**
 * Emails to customers: payment receipt (with activation code and download link) and password reset.
 *
 * Configure SMTP_URL (e.g. smtps://user:password@smtp.zoho.in:465) and MAIL_FROM. Without SMTP_URL
 * nothing is sent (the portal still shows codes and downloads); in tests messages are kept in `outbox`.
 */

import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { passwordFingerprint, signPurposeToken } from '../lib/security.js';
import { availableDownloads } from './downloads.js';

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

/** Plain paragraphs + optional buttons (first one filled) → simple, mail-client-safe HTML. */
function layout(paragraphs, buttons, highlight) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
  const box = highlight
    ? `<div style="border:1px solid #dbe3f5;background:#f5f8ff;border-radius:10px;padding:16px 18px;margin:0 0 18px">${highlight
        .map(([k, v, big]) => `<div style="margin:2px 0"><span style="color:#6b7280">${escapeHtml(k)}:</span> <strong style="${big ? 'font-family:Consolas,monospace;font-size:20px;letter-spacing:1px;color:#111827' : ''}">${escapeHtml(v)}</strong></div>`)
        .join('')}</div>`
    : '';
  const cta = buttons.length
    ? `<p style="margin:22px 0">${buttons
        .map(
          (b, i) =>
            `<a href="${escapeHtml(b.url)}" style="display:inline-block;margin:0 8px 8px 0;${i === 0 ? 'background:#224cc8;color:#fff;' : 'background:#fff;color:#224cc8;border:1px solid #224cc8;'}padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(b.label)}</a>`,
        )
        .join('')}</p>`
    : '';
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#1f2937;max-width:560px">
<p style="font-size:20px;font-weight:700;margin:0 0 18px"><span style="color:#224cc8">Doc</span><span style="color:#d8943e">Gen</span></p>
${box}${body}${cta}
<p style="color:#6b7280;font-size:13px;margin-top:28px">Questions? Reply to this email or write to ${escapeHtml(config.supportEmail)}.<br>DocGen · a product of reynrel.in</p></div>`;
}

export async function sendMail({ to, subject, paragraphs, button, buttons = button ? [button] : [], highlight = null, replyTo = config.supportEmail }) {
  const t = getTransport();
  if (!t) return false;
  const text = [
    ...(highlight ? [highlight.map(([k, v]) => `${k}: ${v}`).join('\n')] : []),
    ...paragraphs,
    ...buttons.map((b) => `${b.label}: ${b.url}`),
  ].join('\n\n');
  const message = { from: config.mailFrom, replyTo, to, subject, text, html: layout(paragraphs, buttons, highlight) };
  await t.sendMail(message);
  if (config.isTest) outbox.push(message);
  return true;
}

const money = (paise, currency) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR' }).format(paise / 100);
const day = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * After a payment: license code, validity, download links (7 days) and — for an account created at
 * checkout — a link to choose a password (7 days); otherwise a link to the account.
 */
export async function sendPaymentReceipt(knex, payment, license) {
  if (!mailEnabled()) return false;
  const client = await knex('clients').where({ id: payment.client_id }).first();
  const plan = await knex('plans').where({ id: payment.plan_id }).first();
  if (!client) return false;
  const validity =
    !license.expires_at && license.duration_days === 0
      ? 'Lifetime'
      : license.expires_at
        ? day(license.expires_at)
        : `${license.duration_days} days from the first activation`;
  const renewal = payment.renew_license_id && payment.renew_license_id === license.id;
  const buttons = (await availableDownloads(knex, client.id, '7d')).map((d) => ({
    label: d.type === 'page' ? 'Install DocGen Mobile' : `Download for ${d.label}`,
    url: d.type === 'link' ? d.url : `${config.portalUrl}${d.url}`,
  }));
  if (!buttons.length && client.password_hash) buttons.push({ label: 'Download DocGen', url: `${config.portalUrl}/account` });
  if (!client.password_hash) {
    const token = signPurposeToken('reset', { sub: String(client.id), tv: client.token_version, ph: passwordFingerprint(client.password_hash) }, '7d');
    buttons.push({ label: 'Create your password', url: `${config.portalUrl}/reset-password?setup=1&token=${encodeURIComponent(token)}` });
  } else {
    if (buttons[0]?.label !== 'Download DocGen') buttons.push({ label: 'Open my account', url: `${config.portalUrl}/account` });
  }
  return sendMail({
    to: client.email,
    subject: renewal ? 'Your DocGen license is renewed' : 'Your DocGen license and download',
    highlight: [
      ['License code', license.code, true],
      ['Valid until', validity],
      ['Computers', String(license.max_devices)],
    ],
    paragraphs: [
      `Hi ${client.name},`,
      `Thank you for ${renewal ? 'renewing' : 'buying'} ${plan?.name || 'DocGen'}. We received ${money(payment.amount_paise, payment.currency)} (order #${payment.id}, one-time payment).`,
      renewal
        ? 'Your license has been extended. DocGen picks up the new date automatically; in the app you can also use Settings → License → "Check license now".'
        : 'To start: download and install DocGen, open it, choose "I Have a License" and enter the code above.',
      buttons.length > 1 ? 'The download links below work for 7 days. You can always download DocGen again from your account (Downloads).' : '',
      !client.password_hash
        ? `Create a password to sign in to your account on our website${buttons.length === 1 ? ' (where you can download DocGen)' : ''}, or to sign in to the app with your email instead of the code.`
        : '',
    ].filter(Boolean),
    buttons,
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

/** Help & Support: confirmation to the customer and a copy to the support inbox (reply-to: the customer). */
export async function sendSupportReceived(request, message, topicLabel) {
  if (!mailEnabled()) return false;
  const ref = `#${request.id}`;
  const link = request.client_id ? `${config.portalUrl}/account/support/${request.id}` : '';
  await sendMail({
    to: request.email,
    subject: `We received your request ${ref}: ${request.subject}`,
    highlight: [
      ['Request', ref],
      ['Topic', topicLabel],
    ],
    paragraphs: [
      `Hi ${request.name},`,
      'Thank you for writing to DocGen Help & Support. We usually reply within one working day (Monday to Saturday).',
      link ? 'You can follow the conversation and reply in your account.' : 'Our answer will come to this email address. To add something, just reply to this email.',
      `Your message:\n${message}`,
    ],
    buttons: link ? [{ label: 'Open my request', url: link }] : [],
  });
  return sendMail({
    to: config.supportEmail,
    replyTo: request.email,
    subject: `[Support ${ref}] ${request.subject}`,
    highlight: [
      ['From', `${request.name} <${request.email}>`],
      ['Phone', request.phone || '—'],
      ['Topic', topicLabel],
    ],
    paragraphs: [message, 'Answer in the admin panel (the customer gets your reply by email), or reply to this email.'],
    buttons: [{ label: 'Open in the admin panel', url: `${config.portalUrl}/admin/support/${request.id}` }],
  });
}

/** A new message from the customer on an existing request → support inbox. */
export async function notifySupportMessage(request, message) {
  if (!mailEnabled()) return false;
  return sendMail({
    to: config.supportEmail,
    replyTo: request.email,
    subject: `[Support #${request.id}] New reply: ${request.subject}`,
    paragraphs: [`${request.name} wrote:`, message],
    buttons: [{ label: 'Open in the admin panel', url: `${config.portalUrl}/admin/support/${request.id}` }],
  });
}

/** Support answered → customer. */
export async function sendSupportReply(request, message, closed) {
  if (!mailEnabled()) return false;
  const link = request.client_id ? `${config.portalUrl}/account/support/${request.id}` : '';
  return sendMail({
    to: request.email,
    subject: `Re: ${request.subject} [#${request.id}]`,
    paragraphs: [
      `Hi ${request.name},`,
      message,
      closed
        ? 'We have marked this request as solved. If you still need help, reply and we will continue.'
        : link
          ? 'You can reply in your account or simply reply to this email.'
          : 'Simply reply to this email if you have more questions.',
    ],
    buttons: link ? [{ label: 'View the conversation', url: link }] : [],
  });
}
