import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi, dateTime, money, qs } from '../../api.js';
import { Badge, Empty, ErrorText, Pagination, Spinner, useDialog, useLoad, useToast } from '../../components/ui.jsx';

export default function AdminPayments() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const status = params.get('status') || '';
  const page = Number(params.get('page') || 1);
  const { data, loading, error, reload } = useLoad(() => adminApi.get(`/payments${qs({ q: params.get('q') || '', status, page, pageSize: 25 })}`), [params.toString()]);

  const dialog = useDialog();
  const markPaid = async (p) => {
    const reference = await dialog.prompt({
      title: `Confirm payment #${p.id}`,
      message: `${money(p.amount, p.currency)} from ${p.client.email} (${p.planName}). The license is issued immediately and the customer gets an email.`,
      label: 'Payment reference (UTR / cheque no.)',
      confirmLabel: 'Mark as paid',
    });
    if (reference === null) return;
    try {
      const r = await adminApi.post(`/payments/${p.id}/mark-paid`, { reference });
      toast(`Payment confirmed. License ${r.license.code} issued.`);
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  const refund = async (p) => {
    const ok = await dialog.confirm({
      title: `Record refund for order #${p.id}?`,
      message: `First refund ${money(p.amount, p.currency)} to ${p.client.email} in your Razorpay dashboard. This marks the payment as refunded and cancels the license it bought.`,
      confirmLabel: 'Mark refunded',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await adminApi.post(`/payments/${p.id}/refund`, { revokeLicense: true });
      toast(r.licenseRevoked ? 'Refund recorded; license cancelled.' : 'Refund recorded.');
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <p className="muted">Every order. Unfinished checkouts stay “pending”; Razorpay payments are confirmed automatically.</p>
        </div>
      </div>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ q, status });
        }}
      >
        <input className="input" placeholder="Search customer, order or payment id" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={status} onChange={(e) => setParams({ q, status: e.target.value })}>
          <option value="">All statuses</option>
          {['pending', 'paid', 'failed', 'created', 'cancelled', 'refunded'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="btn">Search</button>
      </form>
      <ErrorText error={error} />
      {loading ? (
        <Spinner />
      ) : !data?.rows.length ? (
        <Empty>No payments found.</Empty>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Method</th>
                <th className="right">Amount</th>
                <th>Status</th>
                <th>Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    #{p.id}
                    <div className="muted small mono">{p.providerPaymentId || p.providerOrderId}</div>
                  </td>
                  <td>
                    <Link to={`/admin/clients/${p.client.id}`}>{p.client.name}</Link>
                    <div className="muted small">{p.client.email}</div>
                  </td>
                  <td>{p.planName}</td>
                  <td>{p.provider}</td>
                  <td className="right">{money(p.amount, p.currency)}</td>
                  <td>
                    <Badge status={p.status} />
                  </td>
                  <td>{dateTime(p.paidAt || p.createdAt)}</td>
                  <td className="right">
                    {['pending', 'created', 'failed'].includes(p.status) && (
                      <button className="btn btn-sm" onClick={() => markPaid(p)}>
                        Mark paid
                      </button>
                    )}
                    {p.status === 'paid' && (
                      <button className="btn btn-sm btn-ghost" onClick={() => refund(p)}>
                        Refund
                      </button>
                    )}
                  </td>
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
