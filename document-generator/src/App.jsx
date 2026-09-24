import { useEffect } from 'react';
import { AppDataProvider, useAppData } from './hooks/useAppData.jsx';
import { UiProvider, useConfirm } from './hooks/useUi.jsx';
import { RouterProvider, matchPath, setLeaveConfirm, useRouter } from './router/router.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import { Spinner } from './components/Common.jsx';
import SetupWizard from './features/setup/SetupWizard.jsx';
import DashboardPage from './features/dashboard/DashboardPage.jsx';
import DocumentsHomePage from './features/documents/DocumentsHomePage.jsx';
import CreatedDocumentsPage from './features/documents/CreatedDocumentsPage.jsx';
import DocumentEditorPage from './features/documents/DocumentEditorPage.jsx';
import DocumentViewPage from './features/documents/DocumentViewPage.jsx';
import ProductsPage from './features/products/ProductsPage.jsx';
import SettingsPage from './features/settings/SettingsPage.jsx';
import PremiumPage from './features/premium/PremiumPage.jsx';
import AdManager from './features/ads/AdManager.jsx';

/** Route table: first match wins. */
const ROUTES = [
  ['/dashboard', DashboardPage],
  ['/documents', DocumentsHomePage],
  ['/created', CreatedDocumentsPage],
  ['/products', ProductsPage],
  ['/settings', SettingsPage],
  ['/settings/:section', SettingsPage],
  ['/premium', PremiumPage],
  ['/doc/new/:type', DocumentEditorPage],
  ['/doc/:id/edit', DocumentEditorPage],
  ['/doc/:id', DocumentViewPage],
];

function useTheme(theme) {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' || !theme ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

function Routes() {
  const { path, query } = useRouter();
  for (const [pattern, Component] of ROUTES) {
    const params = matchPath(pattern, path);
    if (params) return <Component key={`${pattern}:${JSON.stringify(params)}:${query.from || ''}:${query.mode || ''}`} params={params} query={query} />;
  }
  return <DashboardPage params={{}} query={{}} />;
}

function Shell() {
  const { loading, error, settings, reload } = useAppData();
  const confirm = useConfirm();
  useTheme(settings?.theme);

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
  return (
    <AppLayout>
      <Routes />
      <AdManager />
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
