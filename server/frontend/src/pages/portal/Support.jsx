/**
 * Help & Support.
 *   Website /support: quick answers and the request form (visitors and signed-in customers).
 *   Client panel /account/support: the customer's requests, the conversation with support, reply / mark solved.
 * Contact Us uses the same form. Requests and replies are handled in Admin → Support requests.
 */

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { clientApi, dateTime } from '../../api.js';
import { Badge, Empty, ErrorText, Field, Input, Select, Spinner, Textarea, useLoad, useToast } from '../../components/ui.jsx';
import Icon from '../../components/Icons.jsx';
import { SiteFooter, SiteHeader, useAuth } from '../../App.jsx';
import { SUPPORT_EMAIL, SUPPORT_TOPICS } from '../../constants.js';

/** Status as the customer sees it. */
export const CUSTOMER_STATUS = { open: 'Waiting for our reply', answered: 'Answered', closed: 'Solved' };

/**
 * Send a request. Signed-in customers write as themselves (name and email filled in, request listed in their
 * account); visitors get the answer by email.
 */
export function SupportForm({ source = 'website', defaultTopic = 'other', onSent, compact = false }) {
  const { client } = useAuth();
  const user = client.user;
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '', topic: defaultTopic, subject: '', message: '', website: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (error?.details?.fields?.[k]) setError(null);
  };
  const fieldError = (k) => error?.details?.fields?.[k];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await clientApi.post('/support', { ...form, source });
      if (onSent) onSent(r.request);
      else setSent(r);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="support-sent" data-testid="support-sent">
        <span className="support-sent-icon">
          <Icon name="check" size={26} strokeWidth={2.4} />
        </span>
        <h3>Thank you — we received your message</h3>
        <p>
          Your request number is <strong data-testid="support-ref">#{sent.request.id}</strong>. We usually reply within one working day
          {sent.emailEnabled ? `, by email to ${sent.request.email || form.email}` : ''}.
        </p>
        {user ? (
          <Link className="btn btn-primary" to={`/account/support/${sent.request.id}`}>
            View in my account
          </Link>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setSent(null);
              setForm((f) => ({ ...f, subject: '', message: '' }));
            }}
          >
            Send another message
          </button>
        )}
      </div>
    );
  }

  return (
    <form className="form" onSubmit={submit} data-testid="support-form" noValidate>
      <ErrorText error={error?.details?.fields ? { message: 'Please check the highlighted fields.' } : error} />
      {user ? (
        <p className="small muted" style={{ margin: 0 }}>
          Writing as <strong>{user.name}</strong> ({user.email}). Our answer appears in your account and arrives by email.
        </p>
      ) : (
        <div className={compact ? 'form' : 'grid-2'}>
          <Field label="Your name" error={fieldError('name')}>
            <Input value={form.name} onChange={set('name')} autoComplete="name" required data-testid="support-name" />
          </Field>
          <Field label="Email address" error={fieldError('email')} hint="We reply to this address">
            <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" required data-testid="support-email" />
          </Field>
          <Field label="Mobile number (optional)" error={fieldError('phone')}>
            <Input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" data-testid="support-phone" />
          </Field>
          <Field label="Topic">
            <Select value={form.topic} onChange={set('topic')} options={SUPPORT_TOPICS} data-testid="support-topic" />
          </Field>
        </div>
      )}
      {user && (
        <Field label="Topic">
          <Select value={form.topic} onChange={set('topic')} options={SUPPORT_TOPICS} data-testid="support-topic" />
        </Field>
      )}
      <Field label="Subject" error={fieldError('subject')}>
        <Input value={form.subject} onChange={set('subject')} maxLength={160} placeholder="e.g. License key not received" required data-testid="support-subject" />
      </Field>
      <Field label="Your message" error={fieldError('message')} hint="Tell us what happened and, if possible, your license key or payment reference.">
        <Textarea rows={6} value={form.message} onChange={set('message')} maxLength={5000} required data-testid="support-message" />
      </Field>
      {/* Left empty by people; robots fill it in. */}
      <input className="hp-field" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={(e) => set('website')(e.target.value)} name="website" />
      <button className="btn btn-primary btn-lg" disabled={busy} data-testid="support-send">
        <Icon name="send" size={17} /> {busy ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}

const QUICK_HELP = [
  { icon: 'key', title: 'License & activation', text: 'Your license key is in your account under My License, and in the email you got after payment.', link: { to: '/login', label: 'Log in to see it' } },
  { icon: 'phone', title: 'Install on your phone', text: 'Open DocGen Mobile in Chrome and tap ⋮ → Install. Step-by-step pictures in the guide.', link: { to: '/mobile#android', label: 'Android install guide' } },
  { icon: 'download', title: 'Install on your computer', text: 'Download DocGen for Windows, macOS or Linux from your account (Downloads) and enter your key.', link: { to: '/account/downloads', label: 'Go to Downloads' } },
  { icon: 'rupee', title: 'Payments & refunds', text: 'One-time payment, no automatic renewal. Refunds within 7 days are explained in our policy.', link: { to: '/refunds', label: 'Cancellation & Refunds' } },
];

/** Website: Help & Support. */
export default function SupportPage() {
  const { client } = useAuth();
  return (
    <div className="site">
      <SiteHeader nav />
      <main>
        <section className="lp-section support-hero">
          <span className="lp-eyebrow">Help &amp; Support</span>
          <h1 className="lp-title">How can we help?</h1>
          <p className="lp-lead">Find a quick answer below, or send us a request. We reply within one working day, Monday to Saturday.</p>
        </section>
        <section className="lp-section support-quick" aria-label="Quick help">
          {QUICK_HELP.map((q) => (
            <div key={q.title} className="feature">
              <span className="feature-icon">
                <Icon name={q.icon} size={20} />
              </span>
              <h3>{q.title}</h3>
              <p>{q.text}</p>
              <Link to={q.link.to} className="support-quick-link">
                {q.link.label} →
              </Link>
            </div>
          ))}
        </section>
        <div className="lp-band">
          <section className="lp-section support-form-section" id="request">
            <div className="support-form-side">
              <h2>Send a request</h2>
              <p className="muted">Describe your question or problem. You will get a request number and our answer by email{client.user ? ' and in your account' : ''}.</p>
              {client.user ? (
                <Link className="btn btn-sm" to="/account/support">
                  My requests
                </Link>
              ) : (
                <p className="small muted">
                  Already a customer? <Link to="/login?next=/account/support">Log in</Link> to see all your requests and our answers in one place.
                </p>
              )}
              <p className="small muted">
                Prefer email? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
              </p>
            </div>
            <div className="card">
              <SupportForm source="website" />
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** Client panel: Help & Support — my requests and a new request. */
export function MySupport() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useLoad(() => clientApi.get('/support'), []);
  const [writing, setWriting] = useState(false);
  const requests = data?.requests || [];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Help &amp; Support</h1>
          <p className="muted">Ask a question or report a problem. We reply within one working day; you also get our answer by email.</p>
        </div>
        {!writing && (
          <button className="btn btn-primary" onClick={() => setWriting(true)} data-testid="new-request">
            <Icon name="chat" size={17} /> New request
          </button>
        )}
      </div>
      <ErrorText error={error} />
      {writing && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>New request</h3>
            <button className="btn btn-sm btn-ghost" onClick={() => setWriting(false)}>
              Cancel
            </button>
          </div>
          <SupportForm
            source="panel"
            onSent={(request) => {
              setWriting(false);
              reload();
              navigate(`/account/support/${request.id}`);
            }}
          />
        </div>
      )}
      {loading && !data ? (
        <Spinner />
      ) : requests.length === 0 ? (
        !writing && (
          <Empty>
            <p>You have not sent any requests yet.</p>
            <p className="small muted">
              Quick answers: <Link to="/support">Help &amp; Support</Link> · <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </p>
          </Empty>
        )
      ) : (
        <div className="request-list" data-testid="my-requests">
          {requests.map((r) => (
            <Link key={r.id} to={`/account/support/${r.id}`} className="request-item card">
              <span className="request-main">
                <strong>{r.subject}</strong>
                <span className="small muted">
                  #{r.id} · {r.topicLabel} · {dateTime(r.lastMessageAt)}
                </span>
              </span>
              <Badge status={r.status}>{CUSTOMER_STATUS[r.status]}</Badge>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

/** The conversation of one request, oldest message first. */
export function Conversation({ messages, customerName, supportLabel = 'DocGen Support' }) {
  return (
    <div className="thread" data-testid="thread">
      {messages.map((m) => (
        <div key={m.id} className={`message message-${m.author}`}>
          <div className="message-head">
            <strong>{m.author === 'support' ? supportLabel : customerName}</strong>
            <span className="small muted">{dateTime(m.createdAt)}</span>
          </div>
          <div className="message-body">{m.body}</div>
        </div>
      ))}
    </div>
  );
}

/** Client panel: one request. */
export function MySupportRequest() {
  const { id } = useParams();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => clientApi.get(`/support/${id}`), [id]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState(null);
  const request = data?.request;

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setSendError(null);
    try {
      await clientApi.post(`/support/${id}/messages`, { message: reply });
      setReply('');
      await reload();
      toast('Message sent');
    } catch (err) {
      setSendError(err);
    } finally {
      setBusy(false);
    }
  };
  const solve = async () => {
    await clientApi.post(`/support/${id}/close`);
    toast('Marked as solved. Thank you!');
    reload();
  };

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  return (
    <>
      <Link to="/account/support" className="back-link">
        ← All requests
      </Link>
      <div className="page-head">
        <div>
          <h1>{request.subject}</h1>
          <p className="muted">
            Request #{request.id} · {request.topicLabel} · sent {dateTime(request.createdAt)}
          </p>
        </div>
        <Badge status={request.status}>
          <span data-testid="request-status">{CUSTOMER_STATUS[request.status]}</span>
        </Badge>
      </div>
      <Conversation messages={request.messages} customerName="You" />
      <form className="card form reply-box" onSubmit={send}>
        <ErrorText error={sendError} />
        <Field label={request.status === 'closed' ? 'Still need help? Write to reopen this request' : 'Add a message'}>
          <Textarea rows={4} value={reply} onChange={setReply} maxLength={5000} data-testid="reply-message" />
        </Field>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {request.status !== 'closed' ? (
            <button type="button" className="btn btn-ghost" onClick={solve} data-testid="mark-solved">
              <Icon name="check" size={16} /> My problem is solved
            </button>
          ) : (
            <span />
          )}
          <button className="btn btn-primary" disabled={busy || reply.trim().length < 10} data-testid="reply-send">
            <Icon name="send" size={16} /> {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </>
  );
}
