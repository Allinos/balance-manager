/**
 * Help & Support: requests from the website (Help & Support, Contact Us) and the client panel, and the
 * conversation with the support team. Emails go out when SMTP is configured; everything is also
 * visible in the admin panel (and in the client panel for requests sent while signed in).
 */

import { insertOne, nowIso, updateOne } from '../db.js';
import { notifySupportMessage, sendSupportReceived, sendSupportReply } from './mail.js';

export const SUPPORT_TOPICS = {
  buying: 'Buying & payment',
  license: 'License & activation',
  install: 'Installing DocGen',
  using: 'Using DocGen',
  refund: 'Cancellation & refund',
  other: 'Something else',
};
export const SUPPORT_STATUSES = ['open', 'answered', 'closed'];

export const publicRequest = (r, messages = null) => ({
  id: r.id,
  clientId: r.client_id ?? null,
  name: r.name,
  email: r.email,
  phone: r.phone,
  topic: r.topic,
  topicLabel: SUPPORT_TOPICS[r.topic] || SUPPORT_TOPICS.other,
  subject: r.subject,
  status: r.status,
  source: r.source,
  lastMessageBy: r.last_message_by,
  lastMessageAt: r.last_message_at,
  createdAt: r.created_at,
  ...(messages ? { messages: messages.map((m) => ({ id: m.id, author: m.author, body: m.body, createdAt: m.created_at })) } : {}),
});

const mailError = (e) => console.error('Support email failed:', e.message);

export async function createRequest(knex, { client, name, email, phone, topic, subject, message, source }) {
  const ts = nowIso();
  const request = await knex.transaction(async (trx) => {
    const row = await insertOne(trx, 'support_requests', {
      client_id: client?.id ?? null,
      name,
      email,
      phone: phone || '',
      topic,
      subject,
      status: 'open',
      source,
      last_message_by: 'customer',
      last_message_at: ts,
      created_at: ts,
      updated_at: ts,
    });
    await trx('support_messages').insert({ request_id: row.id, author: 'customer', body: message, created_at: ts });
    return row;
  });
  // A mail problem never loses the request: it is saved and shown in the admin panel either way.
  await sendSupportReceived(request, message, SUPPORT_TOPICS[topic]).catch(mailError);
  return request;
}

export const requestMessages = (knex, id) => knex('support_messages').where({ request_id: id }).orderBy('id');

/**
 * Add a message. A customer message (re)opens the request; a support message marks it answered,
 * or closed with `close`. Emails the other side.
 */
export async function addMessage(knex, request, { author, body, adminId = null, close = false }) {
  const ts = nowIso();
  const status = author === 'customer' ? 'open' : close ? 'closed' : 'answered';
  const updated = await knex.transaction(async (trx) => {
    await trx('support_messages').insert({ request_id: request.id, author, admin_id: adminId, body, created_at: ts });
    return updateOne(trx, 'support_requests', { id: request.id }, { status, last_message_by: author, last_message_at: ts, updated_at: ts });
  });
  await (author === 'customer' ? notifySupportMessage(updated, body) : sendSupportReply(updated, body, close)).catch(mailError);
  return updated;
}

export const setStatus = (knex, request, status) => updateOne(knex, 'support_requests', { id: request.id }, { status, updated_at: nowIso() });
