/**
 * Admin → Partners: applications to approve, each partner's code, commission %, dashboard permissions and terms
 * acceptance, and the commissions to approve, pay (with the payout reference) or reverse. services/partners.js.
 */

import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { adminApi, date, dateTime, money, qs } from '../../api.js';
import { Badge, CopyButton, Empty, ErrorText, Field, Input, Pagination, Select, Spinner, Textarea, useDialog, useLoad, useToast } from '../../components/ui.jsx';

const STATUS_OPTIONS = [
  { value: '', label: 'All partners' },
  { value: 'pending', label: 'Waiting for approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'terminated', label: 'Terminated' },
];
const PERMISSIONS = [
  ['dashboard', 'Dashboard with statistics', 'Off: the partner sees only their link and code'],
  ['customerNames', 'Customer names', 'Off: names are masked (R***i K.)'],
  ['salesAmounts', 'Sales amounts', 'What referred customers paid'],
  ['commissions', 'Commissions and earnings', 'Commission list, pending and paid amounts'],
  ['shareTools', 'Share buttons', 'WhatsApp / copy message on the dashboard'],
];

function CommissionTable({ rows, onChanged, showPartner = false }) {
  const toast = useToast();
  const dialog = useDialog();
  const act = async (c, action) => {
    const body = {};
    if (action === 'pay') {
      const ref = await dialog.prompt({ title: `Pay ${money(c.amount)} to ${c.partnerName || 'the partner'}`, message: 'Enter the payout reference (UTR / UPI transaction id) after transferring the money.', label: 'Payout reference' });
      if (!ref) return;
      body.payoutRef = ref;
    }
    if (action === 'reverse') {
      const reason = await dialog.prompt({ title: 'Reverse this commission', message: c.status === 'paid' ? 'It was already paid: the amount is deducted from the next payout.' : 'The partner will not be paid for this sale.', label: 'Reason' });
      if (reason === null) return;
      body.reason = reason;
    }
    try {
      await adminApi.post(`/partners/commissions/${c.id}/${action}`, body);
      toast(action === 'approve' ? 'Commission approved' : action === 'pay' ? 'Marked as paid' : 'Commission reversed');
      onChanged();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  if (!rows.length) return <Empty>No commissions yet.</Empty>;
  return (
    <div className="table-wrap">
      <table className="table" data-testid="commission-table">
        <thead>
          <tr>
            <th>Date</th>
            {showPartner && <th>Partner</th>}
            <th>Customer</th>
            <th className="num">Sale</th>
            <th className="num">Commission</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} data-testid="commission-row">
              <td>{date(c.createdAt)}</td>
              {showPartner && (
                <td>
                  <Link to={`/admin/partners/${c.partnerId}`}>{c.partnerName}</Link> <span className="mono muted small">{c.partnerCode}</span>
                </td>
              )}
              <td>{c.clientId ? <Link to={`/admin/clients/${c.clientId}`}>{c.clientName || `#${c.clientId}`}</Link> : '—'}</td>
              <td className="num">{money(c.base)}</td>
              <td className="num">
                <strong>{money(c.amount)}</strong> <span className="muted small">{c.rate}%</span>
              </td>
              <td>
                <Badge status={c.status}>{c.status}</Badge>
                {c.payable && c.status !== 'paid' && <div className="small muted">payable</div>}
                {c.payoutRef && <div className="small muted">Ref {c.payoutRef}</div>}
                {c.reversalReason && <div className="small muted">{c.reversalReason}{c.reversedAfterPayout ? ' · deduct from next payout' : ''}</div>}
              </td>
              <td className="row-actions">
                {c.status === 'pending' && (
                  <button className="btn btn-sm" onClick={() => act(c, 'approve')} data-testid="commission-approve">
                    Approve
                  </button>
                )}
                {['pending', 'approved'].includes(c.status) && (
                  <button className="btn btn-sm btn-primary" onClick={() => act(c, 'pay')} data-testid="commission-pay">
                    Mark paid
                  </button>
                )}
                {c.status !== 'reversed' && (
                  <button className="btn btn-sm" onClick={() => act(c, 'reverse')} data-testid="commission-reverse">
                    Reverse
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminPartners() {
  const toast = useToast();
  const dialog = useDialog();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const status = params.get('status') || '';
  const page = Number(params.get('page') || 1);
  const tab = params.get('tab') || 'partners';
  const { data, loading, error, reload } = useLoad(() => adminApi.get(`/partners${qs({ q: params.get('q') || '', status, page })}`), [params.toString()]);
  const comm = useLoad(() => (tab === 'commissions' ? adminApi.get(`/partners/commissions${qs({ status: params.get('cstatus') || '' })}`) : Promise.resolve(null)), [tab, params.get('cstatus')]);
  const set = (patch) => setParams(Object.fromEntries(Object.entries({ q: params.get('q') || '', status, tab, ...patch }).filter(([, v]) => v)));

  const add = async () => {
    const name = await dialog.prompt({ title: 'Add a partner', message: 'An approved partner account with a temporary password (e.g. a distributor you signed offline).', label: 'Name' });
    if (!name) return;
    const email = await dialog.prompt({ title: 'Add a partner', label: 'Email' });
    if (!email) return;
    try {
      const r = await adminApi.post('/partners', { name, email });
      await dialog.show({ title: `${r.partner.name} added`, message: `Code ${r.partner.code}. Give the partner this temporary password to sign in at /partners/login:`, value: r.temporaryPassword });
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Partners</h1>
          <p className="muted">
            Authorised partners and distributors. Approve applications, set each partner&apos;s commission and what their dashboard shows, and pay
            commissions. Referral codes and links (<span className="mono">/r/CODE</span>) belong to partners only.
          </p>
        </div>
        <button className="btn btn-primary" onClick={add} data-testid="partner-add">
          Add partner
        </button>
      </div>
      <div className="tabs">
        <button className={tab === 'partners' ? 'active' : ''} onClick={() => set({ tab: '' })} data-testid="tab-partners">
          Partners {data?.counts?.pending ? <span className="badge tone-warn">{data.counts.pending} to approve</span> : null}
        </button>
        <button className={tab === 'commissions' ? 'active' : ''} onClick={() => set({ tab: 'commissions' })} data-testid="tab-commissions">
          Commissions &amp; payouts
        </button>
      </div>
      {tab === 'commissions' ? (
        <>
          <div className="toolbar">
            <Select
              value={params.get('cstatus') || ''}
              onChange={(v) => setParams({ tab: 'commissions', ...(v ? { cstatus: v } : {}) })}
              options={[
                { value: '', label: 'All commissions' },
                { value: 'pending', label: 'Pending' },
                { value: 'approved', label: 'Approved (to pay)' },
                { value: 'paid', label: 'Paid' },
                { value: 'reversed', label: 'Reversed' },
              ]}
            />
            {comm.data && <span className="muted small">Pending commissions become payable {comm.data.holdDays} days after the sale.</span>}
          </div>
          <ErrorText error={comm.error} />
          {comm.loading || !comm.data ? <Spinner /> : <CommissionTable rows={comm.data.rows} onChanged={comm.reload} showPartner />}
        </>
      ) : (
        <>
          <form
            className="toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              set({ q, page: '' });
            }}
          >
            <input className="input" placeholder="Search name, email, phone, company, code" value={q} onChange={(e) => setQ(e.target.value)} data-testid="partner-search" />
            <Select value={status} onChange={(v) => set({ status: v, page: '' })} options={STATUS_OPTIONS} data-testid="partner-status-filter" />
            <button className="btn">Search</button>
          </form>
          <ErrorText error={error} />
          {loading ? (
            <Spinner />
          ) : !data?.rows.length ? (
            <Empty>No partners yet. Partners apply on the website at /partners.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table" data-testid="partner-table">
                <thead>
                  <tr>
                    <th>Partner</th>
                    <th>Status</th>
                    <th>Code</th>
                    <th className="num">Rate</th>
                    <th className="num">Registrations</th>
                    <th className="num">Sales</th>
                    <th className="num">Pending</th>
                    <th className="num">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((p) => (
                    <tr key={p.id} data-testid="partner-row">
                      <td>
                        <Link to={`/admin/partners/${p.id}`}>
                          <strong>{p.name}</strong>
                        </Link>
                        <div className="muted small">{p.email}</div>
                        {p.company && <div className="muted small">{p.company}</div>}
                      </td>
                      <td>
                        <Badge status={p.status}>{p.status}</Badge>
                      </td>
                      <td className="mono">{p.code || '—'}</td>
                      <td className="num">{p.commissionRate}%</td>
                      <td className="num">{p.registrations}</td>
                      <td className="num">
                        {p.sales}
                        <div className="muted small">{money(p.salesAmount)}</div>
                      </td>
                      <td className="num">{money(p.pendingCommission)}</td>
                      <td className="num">{money(p.paidCommission)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(n) => set({ page: String(n) })} />
            </div>
          )}
        </>
      )}
    </>
  );
}

export function AdminPartnerDetail() {
  const { id } = useParams();
  const toast = useToast();
  const dialog = useDialog();
  const { data, loading, error, reload } = useLoad(() => adminApi.get(`/partners/${id}`), [id]);
  const [edit, setEdit] = useState(null);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  const p = data.partner;
  const form = edit || { commissionRate: p.commissionRate, notes: p.notes || '', permissions: p.permissions };
  const save = async (patch, message = 'Saved') => {
    try {
      await adminApi.put(`/partners/${p.id}`, patch);
      toast(message);
      setEdit(null);
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  const setStatus = async (status, label) => {
    const ok = await dialog.confirm({
      title: `${label} ${p.name}?`,
      message:
        status === 'approved'
          ? 'The partner gets a referral code and link and can sign in to the dashboard.'
          : status === 'suspended'
            ? 'The partner is signed out and cannot sign in; their link stops crediting new customers until you approve them again.'
            : 'The partner is signed out and their link stops crediting new customers.',
      danger: status !== 'approved',
      confirmLabel: label,
    });
    if (ok) save({ status }, `${p.name}: ${status}`);
  };
  const changeCode = async () => {
    const code = await dialog.prompt({ title: 'Partner code', message: 'Type a code (4–12 letters or digits), or leave empty for a new generated one. Links with the old code stop crediting.', label: 'Code', defaultValue: '' });
    if (code === null) return;
    try {
      await adminApi.put(`/partners/${p.id}/code`, { code });
      toast('Code changed');
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  const resetPassword = async () => {
    try {
      const r = await adminApi.post(`/partners/${p.id}/reset-password`);
      await dialog.show({ title: 'Temporary password', message: `Give it to ${p.name}; they can change it in their dashboard.`, value: r.temporaryPassword });
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  const t = data.stats.totals;
  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/admin/partners" className="muted small">
            ← Partners
          </Link>
          <h1>
            {p.name} <Badge status={p.status}>{p.status}</Badge>
          </h1>
          <p className="muted">
            {p.email} · {p.phone || 'no phone'} {p.company ? `· ${p.company}` : ''} {p.city ? `· ${p.city}` : ''}
          </p>
        </div>
        <div className="row-actions">
          {p.status !== 'approved' && (
            <button className="btn btn-primary" onClick={() => setStatus('approved', 'Approve')} data-testid="partner-approve">
              Approve
            </button>
          )}
          {p.status === 'pending' && (
            <button className="btn" onClick={() => setStatus('rejected', 'Reject')} data-testid="partner-reject">
              Reject
            </button>
          )}
          {p.status === 'approved' && (
            <button className="btn" onClick={() => setStatus('suspended', 'Suspend')} data-testid="partner-suspend">
              Suspend
            </button>
          )}
          {['approved', 'suspended'].includes(p.status) && (
            <button className="btn btn-danger" onClick={() => setStatus('terminated', 'Terminate')} data-testid="partner-terminate">
              Terminate
            </button>
          )}
          <button className="btn" onClick={resetPassword} data-testid="partner-reset-password">
            New password
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card stat">
          <span className="muted small">Clicks</span>
          <strong>{t.clicks}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Registrations</span>
          <strong data-testid="partner-detail-registrations">{t.registrations}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Sales</span>
          <strong data-testid="partner-detail-sales">{t.sales}</strong>
          <small className="muted">{money(t.salesAmount)}</small>
        </div>
        <div className="card stat">
          <span className="muted small">Pending commission</span>
          <strong data-testid="partner-detail-pending">{money(t.pending)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Paid commission</span>
          <strong data-testid="partner-detail-paid">{money(t.paid)}</strong>
          {t.reversed > 0 && <small className="muted">{money(t.reversed)} reversed</small>}
        </div>
      </div>

      <div className="grid-2">
        <section className="card form">
          <h2 className="section-title">Referral code and commission</h2>
          <dl className="kv">
            <dt>Code</dt>
            <dd>
              <span className="mono" data-testid="partner-detail-code">{p.code || '—'}</span>{' '}
              <button className="btn btn-sm" onClick={changeCode} data-testid="partner-code-edit">
                {p.code ? 'Change' : 'Assign'}
              </button>
            </dd>
            <dt>Link</dt>
            <dd>{p.link ? <>{p.link} <CopyButton text={p.link} /></> : '— (approve the partner first)'}</dd>
            <dt>Terms</dt>
            <dd data-testid="partner-detail-terms">
              {p.termsVersion ? `Version ${p.termsVersion}, accepted ${dateTime(p.termsAcceptedAt)}` : 'Not accepted'}
              {!p.termsCurrent && p.termsVersion && <div className="small muted">Current version is {data.termsVersion}: the partner is asked to accept it.</div>}
            </dd>
          </dl>
          <Field label="Commission %" hint="Of each payment by a referred customer (0–50). Applies to future sales.">
            <Input value={form.commissionRate} onChange={(v) => setEdit({ ...form, commissionRate: v })} data-testid="partner-rate-input" />
          </Field>
          <Field label="Notes (only admins see these)">
            <Textarea value={form.notes} onChange={(v) => setEdit({ ...form, notes: v })} rows={2} />
          </Field>
          <h3 className="section-title">Dashboard permissions</h3>
          {PERMISSIONS.map(([key, label, hint]) => (
            <label className="check" key={key}>
              <input type="checkbox" checked={form.permissions[key] !== false} onChange={(e) => setEdit({ ...form, permissions: { ...form.permissions, [key]: e.target.checked } })} data-testid={`perm-${key}`} />
              <span>
                {label} <span className="muted small">— {hint}</span>
              </span>
            </label>
          ))}
          <div className="row end">
            <button className="btn btn-primary" disabled={!edit} onClick={() => save({ commissionRate: form.commissionRate, notes: form.notes, permissions: form.permissions })} data-testid="partner-save">
              Save
            </button>
          </div>
        </section>
        <section className="card">
          <h2 className="section-title">Application</h2>
          <dl className="kv">
            <dt>Applied</dt>
            <dd>{dateTime(p.createdAt)}</dd>
            <dt>Approved</dt>
            <dd>{p.approvedAt ? dateTime(p.approvedAt) : '—'}</dd>
            <dt>Last sign-in</dt>
            <dd>{p.lastLoginAt ? dateTime(p.lastLoginAt) : '—'}</dd>
            <dt>Promotes through</dt>
            <dd>{p.channel || '—'}</dd>
          </dl>
          <h3 className="section-title">Terms acceptance record</h3>
          <ul className="small" data-testid="partner-terms-history">
            {data.terms.map((t2, i) => (
              <li key={i}>
                Version {t2.version} · {dateTime(t2.acceptedAt)} · IP {t2.ip || '—'}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <h2 className="section-title">Referred customers ({data.clients.length})</h2>
        {!data.clients.length ? (
          <Empty>No customers yet.</Empty>
        ) : (
          <table className="table" data-testid="partner-clients">
            <tbody>
              {data.clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/admin/clients/${c.id}`}>{c.name}</Link>
                  </td>
                  <td>{c.email}</td>
                  <td>{date(c.joinedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="card">
        <h2 className="section-title">Commissions</h2>
        <CommissionTable rows={data.commissions} onChanged={reload} />
      </section>
    </>
  );
}
