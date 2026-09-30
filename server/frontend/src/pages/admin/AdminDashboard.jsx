import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, money } from '../../api.js';
import { Empty, ErrorText, Spinner, useLoad } from '../../components/ui.jsx';

/** Sign-ups, paying customers and revenue per ad source / campaign. */
function Acquisition() {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useLoad(() => adminApi.get(`/stats/acquisition?days=${days}`), [days]);
  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="section-title">Where customers come from</h2>
          <p className="muted small">
            Tag ad links with <span className="mono">?utm_source=google&amp;utm_medium=cpc&amp;utm_campaign=your-campaign</span>. Google and Facebook ad clicks are recognised even without tags.
          </p>
        </div>
        <select className="input" style={{ width: 'auto' }} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last 12 months</option>
        </select>
      </div>
      <ErrorText error={error} />
      {loading ? (
        <Spinner />
      ) : !data.rows.length ? (
        <Empty>No sign-ups in this period.</Empty>
      ) : (
        <div className="card table-card">
          <table className="table" data-testid="acquisition">
            <thead>
              <tr>
                <th>Source</th>
                <th>Campaign</th>
                <th className="right">Sign-ups</th>
                <th className="right">Paying customers</th>
                <th className="right">Conversion</th>
                <th className="right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={`${r.source}|${r.campaign}`}>
                  <td>
                    <span className="source-tag">{r.source}</span>
                  </td>
                  <td>{r.campaign || <span className="muted">—</span>}</td>
                  <td className="right">{r.signups}</td>
                  <td className="right">{r.customers}</td>
                  <td className="right">{r.conversion}%</td>
                  <td className="right">{money(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function AdminDashboard() {
  const { data, loading, error } = useLoad(() => adminApi.get('/stats'), []);
  if (loading) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  const downloads = Object.entries(data.last30Days)
    .filter(([k]) => k.startsWith('download:'))
    .reduce((sum, [, v]) => sum + v, 0);
  const cards = [
    ['Clients', data.clients, '/admin/clients'],
    ['Active licenses', data.activeLicenses, '/admin/licenses?status=active'],
    ['Unused codes', data.unusedCodes, '/admin/licenses?status=unused'],
    ['Active computers', data.devices, '/admin/licenses'],
    ['Paid payments', data.paidPayments, '/admin/payments?status=paid'],
    ['Pending payments', data.pendingPayments, '/admin/payments?status=pending'],
    ['Revenue', money(data.revenue), '/admin/payments?status=paid'],
    ['Downloads (30 days)', downloads, '/admin/config'],
    ['Config checks (30 days)', data.last30Days.config_check || 0, '/admin/config'],
  ];
  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <div className="row">
          <Link className="btn" to="/admin/clients?new=1">
            New client
          </Link>
          <Link className="btn btn-primary" to="/admin/licenses?new=1">
            Create license / codes
          </Link>
        </div>
      </div>
      <div className="stat-grid">
        {cards.map(([label, value, to]) => (
          <Link key={label} to={to} className="stat">
            <span className="stat-value">{value}</span>
            <span className="muted">{label}</span>
          </Link>
        ))}
      </div>
      <Acquisition />
    </>
  );
}
