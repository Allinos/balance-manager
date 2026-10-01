import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { clientApi, adminApi, session } from './api.js';
import { DialogProvider, Spinner, ToastProvider } from './components/ui.jsx';
import Icon from './components/Icons.jsx';
import ProductPage from './pages/portal/ProductPage.jsx';
import CheckoutPage from './pages/portal/Checkout.jsx';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from './pages/portal/Auth.jsx';
import ClientHome from './pages/portal/ClientHome.jsx';
import Account from './pages/portal/Account.jsx';
import AdminLogin from './pages/admin/AdminLogin.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminClients, { AdminClientDetail } from './pages/admin/AdminClients.jsx';
import AdminLicenses from './pages/admin/AdminLicenses.jsx';
import AdminProducts from './pages/admin/AdminProducts.jsx';
import AdminDownloads from './pages/admin/AdminDownloads.jsx';
import AdminWebsite from './pages/admin/AdminWebsite.jsx';
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
export function Brand({ to = '/', tagline = true }) {
  return (
    <Link to={to} className="brand" aria-label="DocGen home">
      <img src="/logo.png" alt="" />
      <span>
        <strong className="wordmark"><span className="brand-doc">Doc</span><span className="brand-gen">Gen</span></strong>
        {tagline && <small>Create. Manage. Grow.</small>}
      </span>
    </Link>
  );
}

/** Header of the public pages (product page, checkout). */
export function SiteHeader({ nav = false }) {
  const { client } = useAuth();
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Brand />
        {nav && (
          <nav className="site-nav">
            <a href="/#features">Features</a>
            <a href="/#screenshots">Screenshots</a>
            <a href="/#pricing">Pricing</a>
          </nav>
        )}
        <div className="site-actions">
          {client.user ? (
            <Link className="btn btn-sm" to="/account">
              My account
            </Link>
          ) : (
            <Link className="btn btn-sm btn-ghost hide-sm" to="/login">
              Sign in
            </Link>
          )}
          {nav && (
            <Link className="btn btn-sm btn-primary" to="/buy" data-testid="header-buy">
              Buy now
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>© {new Date().getFullYear()} DocGen · a product of <a href="https://reynrel.in" target="_blank" rel="noreferrer">reynrel.in</a></span>
        <span>
          <a href="mailto:support@reynrel.in">support@reynrel.in</a> · <Link to="/login">Sign in</Link>
        </span>
      </div>
    </footer>
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
        <Brand to="/account" tagline={false} />
        <nav className="tabs">
          <NavLink to="/account" end>
            My license
          </NavLink>
          <NavLink to="/account/settings">Account</NavLink>
        </nav>
        <div className="topbar-user">
          <span className="muted small hide-sm">{client.user.email}</span>
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

const ADMIN_NAV = [
  ['Sales', [
    ['/admin', 'Dashboard', 'chart', true],
    ['/admin/clients', 'Customers', 'users'],
    ['/admin/payments', 'Payments', 'card'],
    ['/admin/licenses', 'Licenses', 'key'],
  ]],
  ['Product', [
    ['/admin/products', 'Products & pricing', 'box'],
    ['/admin/downloads', 'Downloads', 'download'],
    ['/admin/website', 'Website', 'globe'],
  ]],
  ['Desktop app', [
    ['/admin/config', 'App settings', 'monitor'],
    ['/admin/ads', 'In-app ads', 'megaphone'],
    ['/admin/audit', 'Activity log', 'log'],
  ]],
];

function AdminLayout() {
  const { admin } = useAuth();
  const navigate = useNavigate();
  if (admin.user === undefined) return <Spinner />;
  if (!admin.user) return <Navigate to="/admin/login" replace />;
  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <Brand to="/admin" tagline={false} />
        {ADMIN_NAV.map(([group, links]) => (
          <nav key={group} aria-label={group}>
            <div className="admin-side-label">{group}</div>
            {links.map(([to, label, icon, end]) => (
              <NavLink key={to} to={to} end={end}>
                <Icon name={icon} size={17} />
                {label}
              </NavLink>
            ))}
          </nav>
        ))}
        <div className="admin-user">
          <strong>{admin.user.name}</strong>
          <span className="muted">
            {admin.user.email} · {admin.user.role}
          </span>
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
      </a>{' '}
      · <a href="mailto:support@reynrel.in">support@reynrel.in</a>
    </footer>
  );
}

/** Old addresses keep working (links in earlier emails, bookmarks). */
function KeepQuery({ to }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <DialogProvider>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<ProductPage />} />
              <Route path="/buy" element={<CheckoutPage />} />
              <Route path="/register" element={<KeepQuery to="/buy" />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/account" element={<PortalLayout />}>
                <Route index element={<ClientHome />} />
                <Route path="settings" element={<Account />} />
                <Route path="*" element={<Navigate to="/account" replace />} />
              </Route>
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="clients" element={<AdminClients />} />
                <Route path="clients/:id" element={<AdminClientDetail />} />
                <Route path="licenses" element={<AdminLicenses />} />
                <Route path="payments" element={<AdminPayments />} />
                <Route path="products" element={<AdminProducts />} />
                <Route path="plans" element={<Navigate to="/admin/products" replace />} />
                <Route path="downloads" element={<AdminDownloads />} />
                <Route path="website" element={<AdminWebsite />} />
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
