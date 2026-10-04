/**
 * Support requests from the website (Help & Support, Contact Us) and the client panel.
 * Answer here: the customer gets the reply by email (and sees it in their account when signed in).
 */

import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { adminApi, dateTime, qs } from '../../api.js';
import { Badge, Empty, ErrorText, Field, Pagination, Spinner, Textarea, useLoad, useToast } from '../../components/ui.jsx';
import Icon from '../../components/Icons.jsx';
import { Conversation } from '../portal/Support.jsx';

const STATUS_LABEL = { open: 'Open', answered: 'Answered', closed: 'Solved' };
const FILTERS = [
  { value: '', label: 'To do' },
  { value: 'open', label: 'Open' },
  { value: 'answered', label: 'Answered' },
  { value: 'closed', label: 'Solved' },
  { value: 'all', label: 'All' },
];
const SOURCE_LABEL = { website: 'Website', contact: 'Contact Us', panel: 'Client panel' };

export default function AdminSupport() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const status = params.get('status') || '';
  const page = Number(params.get('page') || 1);
  const { data, loading, error } = useLoad(() => adminApi.get(`/support${qs({ q: params.get('q') || '', status, page, pageSize: 25 })}`), [params.toString()]);
  const counts = data?.counts || {};
  const count = (v) => (v === '' ? (counts.open || 0) + (counts.answered || 0) : v === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[v] || 0);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Support requests</h1>
          <p className="muted">Questions from Help &amp; Support, Contact Us and the client panel. Your reply is emailed to the customer.</p>
        </div>
      </div>
      <div className="toolbar">
        <div className="segmented" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.value} className={status === f.value ? 'active' : ''} onClick={() => setParams({ q, status: f.value })} data-testid={`support-filter-${f.value || 'todo'}`}>
              {f.label} <span className="muted small">{count(f.value)}</span>
            </button>
          ))}
        </div>
        <form
          className="row"
          style={{ flex: 1, minWidth: 220 }}
          onSubmit={(e) => {
            e.preventDefault();
            setParams({ q, status });
          }}
        >
          <input className="input" placeholder="Search name, email, subject" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn">Search</button>
        </form>
      </div>
      <ErrorText error={error} />
      {loading && !data ? (
        <Spinner />
      ) : !data?.rows.length ? (
        <Empty>{status === '' ? 'Nothing to answer. All requests are handled.' : 'No requests found.'}</Empty>
      ) : (
        <div className="card table-card">
          <table className="table" data-testid="support-requests">
            <thead>
              <tr>
                <th>Request</th>
                <th>Customer</th>
                <th className="hide-sm">Topic</th>
                <th>Status</th>
                <th className="hide-sm">Last message</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/admin/support/${r.id}`}>
                      #{r.id} {r.subject}
                    </Link>
                    <div className="muted small">{SOURCE_LABEL[r.source] || r.source}</div>
                  </td>
                  <td>
                    {r.name}
                    <div className="muted small">{r.email}</div>
                  </td>
                  <td className="hide-sm">{r.topicLabel}</td>
                  <td>
                    <Badge status={r.status}>{STATUS_LABEL[r.status]}</Badge>
                    {r.status === 'open' && r.lastMessageBy === 'customer' && <div className="muted small">waiting for you</div>}
                  </td>
                  <td className="hide-sm">{dateTime(r.lastMessageAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination {...data} onPage={(n) => setParams({ q, status, page: String(n) })} />
        </div>
      )}
    </>
  );
}

export function AdminSupportRequest() {
  const { id } = useParams();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => adminApi.get(`/support/${id}`), [id]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState(null);

  const send = async (close) => {
    setBusy(true);
    setSendError(null);
    try {
      await adminApi.post(`/support/${id}/messages`, { message: reply, close });
      setReply('');
      await reload();
      toast(close ? 'Reply sent and request marked solved' : 'Reply sent to the customer');
    } catch (err) {
      setSendError(err);
    } finally {
      setBusy(false);
    }
  };
  const setStatus = async (status) => {
    await adminApi.put(`/support/${id}`, { status });
    toast(status === 'closed' ? 'Marked as solved' : 'Opened again');
    reload();
  };

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  const { request, client } = data;
  return (
    <>
      <Link to="/admin/support" className="back-link">
        ← Support requests
      </Link>
      <div className="page-head">
        <div>
          <h1>{request.subject}</h1>
          <p className="muted">
            #{request.id} · {request.topicLabel} · from {SOURCE_LABEL[request.source] || request.source} · {dateTime(request.createdAt)}
          </p>
        </div>
        <div className="row">
          <Badge status={request.status}>
            <span data-testid="admin-request-status">{STATUS_LABEL[request.status]}</span>
          </Badge>
          {request.status === 'closed' ? (
            <button className="btn btn-sm" onClick={() => setStatus('open')}>
              Open again
            </button>
          ) : (
            <button className="btn btn-sm" onClick={() => setStatus('closed')} data-testid="admin-mark-solved">
              Mark solved
            </button>
          )}
        </div>
      </div>
      <div className="support-detail">
        <div>
          <Conversation messages={request.messages} customerName={request.name} supportLabel="Support (you)" />
          <div className="card form reply-box">
            <ErrorText error={sendError} />
            <Field label={`Reply to ${request.name}`} hint={`Sent by email to ${request.email}${request.clientId ? ' and shown in their account' : ''}.`}>
              <Textarea rows={5} value={reply} onChange={setReply} maxLength={10000} data-testid="admin-reply" />
            </Field>
            <div className="row end">
              <button className="btn" disabled={busy || !reply.trim()} onClick={() => send(true)} data-testid="admin-reply-solve">
                Send &amp; mark solved
              </button>
              <button className="btn btn-primary" disabled={busy || !reply.trim()} onClick={() => send(false)} data-testid="admin-reply-send">
                <Icon name="send" size={16} /> {busy ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          </div>
        </div>
        <aside className="card support-customer">
          <h3>Customer</h3>
          <dl className="kv">
            <dt>Name</dt>
            <dd>{request.name}</dd>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${request.email}`}>{request.email}</a>
            </dd>
            {request.phone && (
              <>
                <dt>Phone</dt>
                <dd>
                  <a href={`tel:${request.phone}`}>{request.phone}</a>
                </dd>
              </>
            )}
          </dl>
          {client ? (
            <Link className="btn btn-sm btn-block" to={`/admin/clients/${client.id}`} data-testid="support-customer-link">
              Open customer account
            </Link>
          ) : (
            <p className="muted small">No customer account with this email (visitor).</p>
          )}
        </aside>
      </div>
    </>
  );
}
