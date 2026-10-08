import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { clientApi, adminApi, session } from './api.js';
import { DialogProvider, Spinner, ToastProvider } from './components/ui.jsx';
import Icon from './components/Icons.jsx';
import { SUPPORT_EMAIL } from './constants.js';
import { track } from './pixel.js';
import ProductPage from './pages/portal/ProductPage.jsx';
import CheckoutPage from './pages/portal/Checkout.jsx';
import OfferPage from './pages/portal/Offer.jsx';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from './pages/portal/Auth.jsx';
import ClientHome from './pages/portal/ClientHome.jsx';
import Services from './pages/portal/Services.jsx';
import DownloadsPage from './pages/portal/DownloadsPage.jsx';
import MobilePage from './pages/portal/MobilePage.jsx';
import { ContactPage, PolicyPage } from './pages/portal/InfoPages.jsx';
import SupportPage, { MySupport, MySupportRequest } from './pages/portal/Support.jsx';
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
import AdminSupport, { AdminSupportRequest } from './pages/admin/AdminSupport.jsx';

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

/** Website menu (header on wide screens, the ☰ menu on phones). */
const SITE_LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/#pricing', label: 'Pricing' },
  { to: '/mobile', label: 'Mobile app' },
  { href: '/#faq', label: 'FAQ' },
  { to: '/support', label: 'Help & Support' },
  { to: '/contact', label: 'Contact' },
];
const SiteLink = ({ link, ...rest }) => (link.to ? <Link to={link.to} {...rest}>{link.label}</Link> : <a href={link.href} {...rest}>{link.label}</a>);

/** Header of the public pages. `nav`: the website menu and Buy now (not on checkout). */
export function SiteHeader({ nav = false }) {
  const { client } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [location.pathname, location.hash]);
  const account = client.user ? (
    <Link className="btn btn-sm" to="/account" data-testid="header-account">
      My account
    </Link>
  ) : (
    <Link className="btn btn-sm" to="/login" data-testid="header-login">
      Login
    </Link>
  );
  return (
    <header className={`site-header ${open ? 'menu-open' : ''}`}>
      <div className="site-header-inner">
        <Brand />
        {nav && (
          <nav className="site-nav" aria-label="Website">
            {SITE_LINKS.map((l) => (
              <SiteLink key={l.label} link={l} />
            ))}
          </nav>
        )}
        <div className="site-actions">
          {account}
          {nav && (
            <Link className="btn btn-sm btn-primary header-buy" to="/buy" data-testid="header-buy">
              Buy now
            </Link>
          )}
          {nav && (
            <button className="icon-btn site-menu-btn" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} data-testid="site-menu">
              <Icon name={open ? 'x' : 'menu'} size={22} />
            </button>
          )}
        </div>
      </div>
      {nav && open && (
        <nav className="site-menu" aria-label="Website menu" data-testid="site-menu-panel">
          {SITE_LINKS.map((l) => (
            <SiteLink key={l.label} link={l} onClick={() => setOpen(false)} />
          ))}
          <div className="site-menu-actions">
            {client.user ? (
              <Link className="btn btn-block" to="/account">
                My account
              </Link>
            ) : (
              <Link className="btn btn-block" to="/login">
                Login
              </Link>
            )}
            <Link className="btn btn-primary btn-block" to="/buy">
              Buy now
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}

const FOOTER_COLUMNS = [
  ['Product', [{ href: '/#features', label: 'Features' }, { href: '/#pricing', label: 'Pricing' }, { to: '/mobile', label: 'Mobile app' }, { to: '/login', label: 'Login' }]],
  ['Help', [{ to: '/support', label: 'Help & Support' }, { to: '/contact', label: 'Contact Us' }, { href: '/#faq', label: 'FAQ' }, { to: '/mobile#android', label: 'Android install guide' }]],
  [
    'Policies',
    [
      { to: '/terms', label: 'Terms & Conditions' },
      { to: '/privacy', label: 'Privacy Policy' },
      { to: '/shipping', label: 'Shipping Policy' },
      { to: '/refunds', label: 'Cancellation & Refunds' },
    ],
  ],
];

export function SiteFooter() {
  return (
    <footer className="site-footer" data-testid="site-footer">
      <div className="site-footer-grid">
        <div className="site-footer-about">
          <Brand tagline={false} />
          <p>Simple, professional GST invoices and business documents on your computer and phone.</p>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </div>
        {FOOTER_COLUMNS.map(([title, links]) => (
          <nav key={title} className="site-footer-col" aria-label={title}>
            <strong>{title}</strong>
            {links.map((l) => (
              <SiteLink key={l.label} link={l} />
            ))}
          </nav>
        ))}
      </div>
      <div className="site-footer-inner">
        <span>
          © 2025-{new Date().getFullYear()} DocGen · a product of{' '}
          <a href="https://reynrel.in" target="_blank" rel="noreferrer">
            reynrel.in
          </a>
        </span>
        <span>Secure payments by Razorpay</span>
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
            { to: '/account/support', label: 'Help & Support', icon: 'help' },
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
      { to: '/admin/support', label: 'Support requests', icon: 'help' },
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
      · <Link to="/support">Help &amp; Support</Link> · <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link>
    </footer>
  );
}

/** Meta Pixel PageView on every public page (not the admin panel). */
function PixelPageViews() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!pathname.startsWith('/admin')) track('PageView');
  }, [pathname]);
  return null;
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
            <PixelPageViews />
            <Routes>
              <Route path="/" element={<ProductPage />} />
              <Route path="/buy" element={<CheckoutPage />} />
              {/* Ad landing page: not linked from the website. */}
              <Route path="/offer" element={<OfferPage />} />
              <Route path="/register" element={<KeepQuery to="/buy" />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/mobile" element={<MobilePage />} />
              <Route path="/support" element={<SupportPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/terms" element={<PolicyPage id="terms" />} />
              <Route path="/privacy" element={<PolicyPage id="privacy" />} />
              <Route path="/shipping" element={<PolicyPage id="shipping" />} />
              <Route path="/refunds" element={<PolicyPage id="refunds" />} />
              <Route path="/cancellation-refunds" element={<Navigate to="/refunds" replace />} />
              <Route path="/account" element={<PortalLayout />}>
                <Route index element={<ClientHome />} />
                <Route path="services" element={<Services />} />
                <Route path="downloads" element={<DownloadsPage />} />
                <Route path="support" element={<MySupport />} />
                <Route path="support/:id" element={<MySupportRequest />} />
                <Route path="settings" element={<Account />} />
                <Route path="*" element={<Navigate to="/account" replace />} />
              </Route>
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="clients" element={<AdminClients />} />
                <Route path="clients/:id" element={<AdminClientDetail />} />
                <Route path="support" element={<AdminSupport />} />
                <Route path="support/:id" element={<AdminSupportRequest />} />
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
