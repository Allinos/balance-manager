import { Link } from 'react-router-dom';
import { adminApi, money } from '../../api.js';
import { ErrorText, Spinner, useLoad } from '../../components/ui.jsx';

export default function AdminDashboard() {
  const { data, loading, error } = useLoad(() => adminApi.get('/stats'), []);
  if (loading) return <Spinner />;
  if (error) return <ErrorText error={error} />;
  const cards = [
    ['Clients', data.clients, '/admin/clients'],
    ['Active licenses', data.activeLicenses, '/admin/licenses?status=active'],
    ['Unused codes', data.unusedCodes, '/admin/licenses?status=unused'],
    ['Active computers', data.devices, '/admin/licenses'],
    ['Paid payments', data.paidPayments, '/admin/payments?status=paid'],
    ['Pending payments', data.pendingPayments, '/admin/payments?status=pending'],
    ['Revenue', money(data.revenue), '/admin/payments?status=paid'],
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
    </>
  );
}
