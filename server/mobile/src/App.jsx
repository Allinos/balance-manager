/**
 * DocGen Mobile: license gate → first-start setup → app with bottom tabs
 * (Dashboard · Documents · Products & Services · Settings).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { saveSettings as persistSettings } from '@desktop/services/settingsService.js';
import Icon from './components/Icon.jsx';
import { UiProvider, go, useRoute } from './components/ui.jsx';
import { refresh, status } from './lib/license.js';
import { AppCtx, loadData } from './data.jsx';
import Activation, { Locked } from './screens/Activation.jsx';
import Setup from './screens/Setup.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Documents from './screens/Documents.jsx';
import Editor from './screens/Editor.jsx';
import View from './screens/View.jsx';
import Products from './screens/Products.jsx';
import Settings, { SettingsSection } from './screens/Settings.jsx';

const TABS = [
  ['/', 'Dashboard', 'home'],
  ['/documents', 'Documents', 'docs'],
  ['/products', 'Products', 'box'],
  ['/settings', 'Settings', 'settings'],
];

function TabBar({ path }) {
  const current = TABS.find(([p]) => (p === '/' ? path === '/' : path.startsWith(p)))?.[0];
  return (
    <nav className="tabbar no-print" aria-label="Main">
      {TABS.map(([p, label, icon]) => (
        <button key={p} className={current === p ? 'active' : ''} onClick={() => go(p)} aria-current={current === p ? 'page' : undefined} data-testid={`tab-${label.toLowerCase()}`}>
          <span className="tab-icon">
            <Icon name={icon} size={21} />
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}

function Screen({ path, query }) {
  let m;
  if ((m = /^\/doc\/new\/([A-Z_]+)$/.exec(path))) return <Editor key={`${path}?${query.from || ''}`} typeId={m[1]} query={query} />;
  if ((m = /^\/doc\/(\d+)\/edit$/.exec(path))) return <Editor key={path} id={Number(m[1])} />;
  if ((m = /^\/doc\/(\d+)$/.exec(path))) return <View key={path} id={Number(m[1])} query={query} />;
  if ((m = /^\/settings\/([a-z]+)$/.exec(path))) return <SettingsSection key={path} id={m[1]} />;
  if (path.startsWith('/documents')) return <Documents key={JSON.stringify(query)} query={query} />;
  if (path.startsWith('/products')) return <Products />;
  if (path.startsWith('/settings')) return <Settings />;
  return <Dashboard />;
}

function Shell() {
  const { path, query } = useRoute();
  const [lic, setLic] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const next = await status();
    setLic(next);
    return next;
  }, []);
  const reloadData = useCallback(async () => {
    try {
      const d = await loadData();
      setData(d);
      return d;
    } catch (e) {
      setError(e.message || 'Your data could not be opened.');
      return null;
    }
  }, []);

  /** Check the license with the server when due (never blocks working offline). */
  const check = useCallback(
    async (force = false) => {
      const current = await status();
      if (current.state === 'none' || (!force && !current.needsCheck) || navigator.onLine === false) return current;
      try {
        const next = await refresh();
        setLic(await status());
        return next;
      } catch (e) {
        if (force) throw e;
        return current;
      }
    },
    [],
  );

  useEffect(() => {
    Promise.all([reload(), reloadData()]).then(() => check());
    const online = () => check();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [reload, reloadData, check]);

  const updateSettings = useCallback(async (values) => {
    await persistSettings(values);
    setData((d) => ({ ...d, settings: { ...d.settings, ...values } }));
  }, []);
  const setCompany = useCallback((company) => setData((d) => ({ ...d, company })), []);
  const setDocSettings = useCallback((docSettings) => setData((d) => ({ ...d, docSettings })), []);

  const ctx = useMemo(
    () => ({ ...(data || {}), lic, reload, reloadData, check, updateSettings, setCompany, setDocSettings }),
    [data, lic, reload, reloadData, check, updateSettings, setCompany, setDocSettings],
  );

  if (error) {
    return (
      <div className="gate center">
        <div className="alert alert-bad">{error}</div>
      </div>
    );
  }
  if (!lic || !data) {
    return (
      <div className="gate center">
        <img src="/app/icons/icon-192.png" alt="" width="72" height="72" style={{ margin: '0 auto' }} />
      </div>
    );
  }
  const main = TABS.some(([p]) => p === path);
  let body;
  if (lic.state === 'none') body = <Activation onDone={reload} message={lic.message} />;
  else if (lic.state !== 'active') body = <Locked />;
  else if (!data.settings.setupComplete && !data.company?.name) body = <Setup />;
  else
    body = (
      <div className={`app ${main ? '' : 'no-tabs'}`}>
        <Screen path={path} query={query} />
        {main && <TabBar path={path} />}
      </div>
    );
  return <AppCtx.Provider value={ctx}>{body}</AppCtx.Provider>;
}

export default function App() {
  return (
    <UiProvider>
      <Shell />
    </UiProvider>
  );
}
