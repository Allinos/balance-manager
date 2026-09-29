import { useEffect } from 'react';
import { AppDataProvider, useAppData } from './hooks/useAppData.jsx';
import { UiProvider, useConfirm } from './hooks/useUi.jsx';
import { RouterProvider, matchPath, setLeaveConfirm, useRouter } from './router/router.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import { Spinner } from './components/Common.jsx';
import SetupWizard from './features/setup/SetupWizard.jsx';
import DashboardPage from './features/dashboard/DashboardPage.jsx';
import DocumentManagerPage from './features/manager/DocumentManagerPage.jsx';
import DocumentEditorPage from './features/documents/DocumentEditorPage.jsx';
import DocumentViewPage from './features/documents/DocumentViewPage.jsx';
import ProductsPage from './features/products/ProductsPage.jsx';
import CustomersPage from './features/customers/CustomersPage.jsx';
import SettingsPage from './features/settings/SettingsPage.jsx';
import HelpPage from './features/help/HelpPage.jsx';
import AdManager from './features/ads/AdManager.jsx';
import ActivationRequired from './features/license/ActivationRequired.jsx';
import { useServerSync } from './hooks/useServerSync.js';

/** Route table: first match wins. */
const ROUTES = [
  ['/dashboard', DashboardPage],
  ['/manager', DocumentManagerPage],
  ['/products', ProductsPage],
  ['/customers', CustomersPage],
  ['/help', HelpPage],
  ['/settings', SettingsPage],
  ['/settings/:section', SettingsPage],
  ['/doc/new/:type', DocumentEditorPage],
  ['/doc/:id/edit', DocumentEditorPage],
  ['/doc/:id', DocumentViewPage],
];

/** Older addresses (v1.0). */
const REDIRECTS = { '/documents': '/dashboard', '/created': '/manager', '/premium': '/settings/license' };

function useTheme(theme) {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme === 'dark' ? 'dark' : 'light';
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

function Routes() {
  const { path, query, navigate } = useRouter();
  const redirect = REDIRECTS[path];
  useEffect(() => {
    if (redirect) {
      const qs = new URLSearchParams(query).toString();
      navigate(`${redirect}${qs ? `?${qs}` : ''}`, { replace: true, force: true });
    }
  }, [redirect, query, navigate]);
  if (redirect) return null;
  for (const [pattern, Component] of ROUTES) {
    const params = matchPath(pattern, path);
    if (params) return <Component key={`${pattern}:${JSON.stringify(params)}:${query.from || ''}:${query.mode || ''}`} params={params} query={query} />;
  }
  return <DashboardPage params={{}} query={query} />;
}

function Shell() {
  const { loading, error, settings, license, reload } = useAppData();
  const confirm = useConfirm();
  useTheme(settings?.theme);
  useServerSync(!loading && !!settings?.setupComplete);

  useEffect(() => {
    setLeaveConfirm((message) =>
      confirm({ title: 'Leave without saving?', message, confirmText: 'Leave', cancelText: 'Stay', danger: true }),
    );
  }, [confirm]);

  if (loading) return <div className="boot"><Spinner label="Opening DocGen…" /></div>;
  if (error || !settings) {
    return (
      <div className="boot">
        <div className="boot-error">
          <h2>DocGen could not start</h2>
          <p>{error || 'Settings could not be loaded.'}</p>
          <button className="btn btn-primary" onClick={reload}>Try again</button>
        </div>
      </div>
    );
  }
  if (!settings.setupComplete) return <SetupWizard />;
  const locked = license?.mode === 'expired';
  return (
    <AppLayout>
      <Routes />
      {locked ? <ActivationRequired /> : <AdManager />}
    </AppLayout>
  );
}

export default function App() {
  return (
    <UiProvider>
      <AppDataProvider>
        <RouterProvider>
          <Shell />
        </RouterProvider>
      </AppDataProvider>
    </UiProvider>
  );
}
