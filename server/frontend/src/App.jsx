import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { clientApi, adminApi, session } from './api.js';
import { DialogProvider, Spinner, ToastProvider } from './components/ui.jsx';
import ProductPage from './pages/portal/ProductPage.jsx';
import CheckoutPage from './pages/portal/Checkout.jsx';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from './pages/portal/Auth.jsx';
import ClientHome from './pages/portal/ClientHome.jsx';
import Services from './pages/portal/Services.jsx';
import DownloadsPage from './pages/portal/DownloadsPage.jsx';
import MobilePage from './pages/portal/MobilePage.jsx';
import PanelLayout from './components/PanelLayout.jsx';
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
            <a href="/#pricing">Pricing</a>
            <Link to="/mobile">Mobile app</Link>
            <a href="/#compare">Compare</a>
            <a href="/#faq">FAQ</a>
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
        <span>© 2025-{new Date().getFullYear()} DocGen · a product of <a href="https://reynrel.in" target="_blank" rel="noreferrer">reynrel.in</a></span>
        <span>
          <a href="mailto:info.reynrel@gmail.com">info.reynrel@gmail.com</a> · <Link to="/login">Sign in</Link>
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
    <PanelLayout
      tone="light"
      home="/account"
      groups={[
        {
          items: [
            { to: '/account', label: 'My License', icon: 'key', end: true },
            { to: '/account/services', label: 'Services', icon: 'box' },
            { to: '/account/downloads', label: 'Downloads', icon: 'download' },
            { to: '/account/settings', label: 'Account', icon: 'user' },
          ],
        },
      ]}
      user={{ name: client.user.name, detail: client.user.email }}
      onSignOut={() => {
        client.signOut();
        navigate('/login');
      }}
    />
  );
}

const ADMIN_NAV = [
  {
    label: 'Sales',
    items: [
      { to: '/admin', label: 'Dashboard', icon: 'chart', end: true },
      { to: '/admin/clients', label: 'Customers', icon: 'users' },
      { to: '/admin/payments', label: 'Payments', icon: 'card' },
      { to: '/admin/licenses', label: 'Licenses', icon: 'key' },
    ],
  },
  {
    label: 'Product',
    items: [
      { to: '/admin/products', label: 'Products & pricing', icon: 'box' },
      { to: '/admin/downloads', label: 'Downloads', icon: 'download' },
      { to: '/admin/website', label: 'Website', icon: 'globe' },
    ],
  },
  {
    label: 'Desktop app',
    items: [
      { to: '/admin/config', label: 'App settings', icon: 'monitor' },
      { to: '/admin/ads', label: 'In-app ads', icon: 'megaphone' },
      { to: '/admin/audit', label: 'Activity log', icon: 'log' },
    ],
  },
];

function AdminLayout() {
  const { admin } = useAuth();
  const navigate = useNavigate();
  if (admin.user === undefined) return <Spinner />;
  if (!admin.user) return <Navigate to="/admin/login" replace />;
  return (
    <PanelLayout
      tone="dark"
      home="/admin"
      badge="Admin"
      groups={ADMIN_NAV}
      user={{ name: admin.user.name, detail: `${admin.user.email} · ${admin.user.role}` }}
      onSignOut={() => {
        admin.signOut();
        navigate('/admin/login');
      }}
    />
  );
}

export function Footer() {
  return (
    <footer className="footer">
      DocGen · A product of{' '}
      <a href="https://reynrel.in" target="_blank" rel="noreferrer">
        reynrel.in
      </a>{' '}
      · <a href="mailto:info.reynrel@gmail.com">info.reynrel@gmail.com</a>
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
              <Route path="/mobile" element={<MobilePage />} />
              <Route path="/account" element={<PortalLayout />}>
                <Route index element={<ClientHome />} />
                <Route path="services" element={<Services />} />
                <Route path="downloads" element={<DownloadsPage />} />
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
