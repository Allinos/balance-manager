/**
 * DocGen Mobile: license gate → first-start setup → app with bottom tabs
 * (Dashboard · Documents · Products & Services · Settings).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { saveSettings as persistSettings } from '@desktop/services/settingsService.js';
import { enabledModules } from '@desktop/config/partyModules.js';
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
import Parties from './screens/Parties.jsx';
import PartyLedger from './screens/PartyLedger.jsx';
import Settings, { SettingsSection } from './screens/Settings.jsx';
import Reports from './screens/Reports.jsx';
import { Welcome, nativeAccount } from './screens/Android.jsx';
import { native, reportScreen } from './lib/native.js';
import { setFreePlan } from './lib/plan.js';

const TABS = [
  ['/', 'Dashboard', 'home'],
  ['/documents', 'Documents', 'docs'],
  ['/products', 'Products', 'box'],
  ['/settings', 'Settings', 'settings'],
];
/** Customers & Vendors: a tab of its own once the feature is switched on (Settings → Features). */
const PARTIES_TAB = ['/parties/all', 'Parties', 'users', '/parties'];

/** Android app: simple reports, always the rightmost tab. */
const REPORTS_TAB = ['/reports', 'Reports', 'chart'];

/** The bottom tabs for these settings: [path, label, icon, matching path prefix?]. */
export const tabsFor = (settings, android = native()) => {
  const tabs = enabledModules(settings || {}).length ? [...TABS.slice(0, 3), PARTIES_TAB, TABS[3]] : TABS;
  // Android: Home opens first (Dashboard with the bills), Reports is the last item on the right.
  return android ? [['/', 'Home', 'home'], ...tabs.slice(1), REPORTS_TAB] : tabs;
};
const tabMatches = ([p, , , prefix], path) => (p === '/' ? path === '/' : path === p || path.startsWith(prefix ? `${prefix}/` : p));

function TabBar({ path, tabs }) {
  const current = tabs.find((t) => tabMatches(t, path))?.[0];
  return (
    <nav className="tabbar no-print" aria-label="Main" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
      {tabs.map(([p, label, icon]) => (
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
  if ((m = /^\/doc\/new\/([A-Z_]+)$/.exec(path))) return <Editor key={`${path}?${query.from || ''}${query.party || ''}`} typeId={m[1]} query={query} />;
  if ((m = /^\/doc\/(\d+)\/edit$/.exec(path))) return <Editor key={path} id={Number(m[1])} />;
  if ((m = /^\/doc\/(\d+)$/.exec(path))) return <View key={path} id={Number(m[1])} query={query} />;
  if ((m = /^\/settings\/([a-z]+)$/.exec(path))) return <SettingsSection key={path} id={m[1]} />;
  if (path.startsWith('/documents')) return <Documents key={JSON.stringify(query)} query={query} />;
  if (path.startsWith('/products')) return <Products />;
  if ((m = /^\/parties(?:\/(all|customer|vendor))?$/.exec(path))) return <Parties key={path} kind={m[1]} />;
  if ((m = /^\/party\/(\d+)$/.exec(path))) return <PartyLedger key={path} id={Number(m[1])} />;
  if (path.startsWith('/settings')) return <Settings />;
  if (path === '/reports' && native()) return <Reports />;
  return <Dashboard />;
}

function Shell() {
  const { path, query } = useRoute();
  const [lic, setLic] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const android = native();
  // Android app: the free account (Firebase, kept by the app); undefined while loading.
  const [account, setAccount] = useState(android ? undefined : null);
  useEffect(() => {
    if (android) nativeAccount().then(setAccount);
  }, [android]);

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

  // Android app without an active license: the free plan (every feature, limited counts, ads).
  const free = android && !!lic && lic.state !== 'active';
  setFreePlan(free);
  const appLic = useMemo(() => (free ? { ...lic, state: 'free', account } : android && lic ? { ...lic, account } : lic), [free, android, lic, account]);
  useEffect(() => {
    if (android && lic && data) reportScreen(path, free);
  }, [android, path, free, lic, data]);

  const ctx = useMemo(
    () => ({ ...(data || {}), lic: appLic, reload, reloadData, check, updateSettings, setCompany, setDocSettings, account, setAccount }),
    [data, appLic, reload, reloadData, check, updateSettings, setCompany, setDocSettings, account],
  );

  if (error) {
    return (
      <div className="gate center">
        <div className="alert alert-bad">{error}</div>
      </div>
    );
  }
  if (!lic || !data || account === undefined) {
    return (
      <div className="gate center">
        <img src="/app/icons/icon-192.png" alt="" width="72" height="72" style={{ margin: '0 auto' }} />
      </div>
    );
  }
  const tabs = tabsFor(data.settings);
  const main = tabs.some(([p, , , prefix]) => p === path || (prefix && path.startsWith(`${prefix}/`)));
  let body;
  if (android && !data.settings.androidWelcome) {
    body = (
      <Welcome
        onDone={async (acc) => {
          await updateSettings({ androidWelcome: true });
          if (acc) setAccount(acc);
        }}
      />
    );
  } else if (free) body = null;
  else if (lic.state === 'none') body = <Activation onDone={reload} message={lic.message} />;
  else if (lic.state !== 'active') body = <Locked />;
  if (body === null || body === undefined) {
    if (!data.settings.setupComplete && !data.company?.name) body = <Setup />;
    else
      body = (
        <div className={`app ${main ? '' : 'no-tabs'}`}>
          <Screen path={path} query={query} />
          {main && <TabBar path={path} tabs={tabs} />}
        </div>
      );
  }
  return <AppCtx.Provider value={ctx}>{body}</AppCtx.Provider>;
}

export default function App() {
  return (
    <UiProvider>
      <Shell />
    </UiProvider>
  );
}
