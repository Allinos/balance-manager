import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { clientApi, adminApi, session } from './api.js';
import { DialogProvider, Spinner, ToastProvider } from './components/ui.jsx';
import Home from './pages/portal/Home.jsx';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './pages/portal/Auth.jsx';
import Overview from './pages/portal/Overview.jsx';
import Business from './pages/portal/Business.jsx';
import Plans from './pages/portal/Plans.jsx';
import Payments from './pages/portal/Payments.jsx';
import Account from './pages/portal/Account.jsx';
import AdminLogin from './pages/admin/AdminLogin.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminClients, { AdminClientDetail } from './pages/admin/AdminClients.jsx';
import AdminLicenses from './pages/admin/AdminLicenses.jsx';
import AdminPlans from './pages/admin/AdminPlans.jsx';
import AdminPayments from './pages/admin/AdminPayments.jsx';
import AdminAds from './pages/admin/AdminAds.jsx';
import AdminConfig from './pages/admin/AdminConfig.jsx';
import AdminAudit from './pages/admin/AdminAudit.jsx';

// ----------------------------------------------------------------- sessions
const AuthCtx = createContext(null);

function useSessionState(kind, loadMe) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const refresh = useCallback(async () => {
    if (!session.get(kind)) return setUser(null);
    try {
      setUser(await loadMe());
    } catch {
      setUser(null);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  useEffect(() => {
    refresh();
    const onOut = (e) => e.detail === kind && setUser(null);
    window.addEventListener('docgen:signed-out', onOut);
    return () => window.removeEventListener('docgen:signed-out', onOut);
  }, [kind, refresh]);
  const signIn = (token, u) => {
    session.set(kind, token);
    setUser(u);
  };
  const signOut = () => {
    session.set(kind, '');
    setUser(null);
  };
  return { user, setUser, refresh, signIn, signOut };
}

function AuthProvider({ children }) {
  const client = useSessionState('client', async () => (await clientApi.get('/me')).client);
  const admin = useSessionState('admin', async () => (await adminApi.get('/me')).admin);
  return <AuthCtx.Provider value={{ client, admin }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);

// ------------------------------------------------------------------ layouts
function Brand({ to = '/' }) {
  return (
    <Link to={to} className="brand">
      <img src="/logo.png" alt="" />
      <span>
        <strong className="wordmark"><span className="brand-doc">Doc</span><span className="brand-gen">Gen</span></strong>
        <small>Create. Manage. Grow.</small>
      </span>
    </Link>
  );
}

function PortalLayout() {
  const { client } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  if (client.user === undefined) return <Spinner />;
  if (!client.user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return (
    <div className="shell">
      <header className="topbar">
        <Brand to="/account" />
        <nav className="tabs">
          <NavLink to="/account" end>Overview</NavLink>
          <NavLink to="/account/plans">Plans &amp; Renewal</NavLink>
          <NavLink to="/account/business">Business details</NavLink>
          <NavLink to="/account/payments">Payments</NavLink>
          <NavLink to="/account/settings">Account</NavLink>
        </nav>
        <div className="topbar-user">
          <span className="muted">{client.user.email}</span>
          <button
            className="btn btn-sm"
            onClick={() => {
              client.signOut();
              navigate('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function AdminLayout() {
  const { admin } = useAuth();
  const navigate = useNavigate();
  if (admin.user === undefined) return <Spinner />;
  if (!admin.user) return <Navigate to="/admin/login" replace />;
  const links = [
    ['/admin', 'Dashboard', true],
    ['/admin/clients', 'Clients'],
    ['/admin/licenses', 'Licenses & Codes'],
    ['/admin/payments', 'Payments'],
    ['/admin/plans', 'Plans'],
    ['/admin/ads', 'Ads'],
    ['/admin/config', 'App configuration'],
    ['/admin/audit', 'Audit log'],
  ];
  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <Brand to="/admin" />
        <div className="admin-tag">Admin</div>
        <nav>
          {links.map(([to, label, end]) => (
            <NavLink key={to} to={to} end={end}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-user">
          <div>{admin.user.name}</div>
          <small className="muted">
            {admin.user.email} · {admin.user.role}
          </small>
          <button
            className="btn btn-sm"
            onClick={() => {
              admin.signOut();
              navigate('/admin/login');
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      DocGen · A product of{' '}
      <a href="https://reynrel.in" target="_blank" rel="noreferrer">
        reynrel.in
      </a>
    </footer>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <DialogProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/account" element={<PortalLayout />}>
              <Route index element={<Overview />} />
              <Route path="plans" element={<Plans />} />
              <Route path="business" element={<Business />} />
              <Route path="payments" element={<Payments />} />
              <Route path="settings" element={<Account />} />
            </Route>
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="clients" element={<AdminClients />} />
              <Route path="clients/:id" element={<AdminClientDetail />} />
              <Route path="licenses" element={<AdminLicenses />} />
              <Route path="payments" element={<AdminPayments />} />
              <Route path="plans" element={<AdminPlans />} />
              <Route path="ads" element={<AdminAds />} />
              <Route path="config" element={<AdminConfig />} />
              <Route path="audit" element={<AdminAudit />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
        </DialogProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
