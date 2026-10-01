import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, date, dateTime, money } from '../../api.js';
import { Empty, ErrorText, Spinner, useLoad } from '../../components/ui.jsx';

/** Sign-ups, paying customers and revenue per ad source / campaign. */
function Acquisition() {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useLoad(() => adminApi.get(`/stats/acquisition?days=${days}`), [days]);
  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="section-title">Where customers come from (ads)</h2>
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
  const month = new Date().toLocaleDateString('en-IN', { month: 'long' });
  const cards = [
    [`Sales in ${month}`, money(data.monthRevenue), `${data.monthSales} ${data.monthSales === 1 ? 'sale' : 'sales'}`, '/admin/payments?status=paid'],
    ['Total revenue', money(data.revenue), `${data.paidPayments} paid orders`, '/admin/payments?status=paid'],
    ['Customers', data.customers, `${data.clients} accounts in total`, '/admin/clients'],
    ['Active licenses', data.activeLicenses, `${data.expiringSoon} ending in 30 days`, '/admin/licenses?status=active'],
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Sales and licenses at a glance.</p>
        </div>
        <div className="row">
          <Link className="btn" to="/admin/products">
            Edit price
          </Link>
          <Link className="btn btn-primary" to="/admin/licenses?new=1">
            Create license
          </Link>
        </div>
      </div>
      <div className="stat-grid" data-testid="stats">
        {cards.map(([label, value, sub, to]) => (
          <Link key={label} to={to} className="stat">
            <span className="stat-label">{label}</span>
            <span className="stat-value">{value}</span>
            <span className="stat-sub">{sub}</span>
          </Link>
        ))}
      </div>
      <div className="dash-grid">
        <section className="card table-card">
          <div className="card-head" style={{ padding: '16px 20px 0' }}>
            <h3>Recent sales</h3>
            <Link to="/admin/payments?status=paid" className="small">
              All payments
            </Link>
          </div>
          {!data.recentSales.length ? (
            <p className="muted" style={{ padding: '8px 20px 18px' }}>
              No sales yet.
            </p>
          ) : (
            <table className="table" data-testid="recent-sales">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Date</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/admin/clients/${p.client.id}`}>{p.client.name}</Link>
                      <div className="muted small">{p.client.email}</div>
                    </td>
                    <td>{dateTime(p.paidAt)}</td>
                    <td className="right">{money(p.amount, p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <h3>Licenses ending soon</h3>
            <Link to="/admin/licenses?status=active" className="small">
              All licenses
            </Link>
          </div>
          {!data.expiring.length ? (
            <p className="muted">No license ends in the next 30 days.</p>
          ) : (
            <ul className="list">
              {data.expiring.map((l) => (
                <li key={l.id}>
                  <span>
                    {l.client.id ? <Link to={`/admin/clients/${l.client.id}`}>{l.client.name}</Link> : <span className="mono">{l.code}</span>}
                    <div className="muted small">{l.client.email || l.code}</div>
                  </span>
                  <span className="small">{date(l.expiresAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="muted small" style={{ marginTop: 12 }}>
            {data.devices} computers activated · {downloads} downloads in 30 days · {data.pendingPayments} unfinished checkouts
          </div>
        </section>
      </div>
      <Acquisition />
    </>
  );
}
