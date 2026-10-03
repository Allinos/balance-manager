/**
 * DocGen Mobile: license gate → company setup → app with bottom tabs
 * (Dashboard · Documents · Products & Services · Settings).
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Icon from './components/Icon.jsx';
import { UiProvider, go, useRoute } from './components/ui.jsx';
import { kvGet, kvSet } from './lib/db.js';
import { refresh, status } from './lib/license.js';
import Activation, { Locked } from './screens/Activation.jsx';
import Setup from './screens/Setup.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Documents from './screens/Documents.jsx';
import Editor from './screens/Editor.jsx';
import View from './screens/View.jsx';
import Products from './screens/Products.jsx';
import Settings from './screens/Settings.jsx';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const TABS = [
  ['/', 'Dashboard', 'home'],
  ['/documents', 'Documents', 'docs'],
  ['/products', 'Products', 'box'],
  ['/settings', 'Settings', 'settings'],
];

function TabBar({ path }) {
  const current = TABS.find(([p]) => (p === '/' ? path === '/' : path.startsWith(p)))?.[0];
  return (
    <nav className="tabbar" aria-label="Main">
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

function Screen({ path }) {
  let m;
  if ((m = /^\/doc\/new\/([A-Z_]+)$/.exec(path))) return <Editor typeId={m[1]} />;
  if ((m = /^\/doc\/(\d+)\/edit$/.exec(path))) return <Editor id={Number(m[1])} />;
  if ((m = /^\/doc\/(\d+)\/copy$/.exec(path))) return <Editor copyOf={Number(m[1])} />;
  if ((m = /^\/doc\/(\d+)$/.exec(path))) return <View id={Number(m[1])} />;
  if (path.startsWith('/documents')) return <Documents />;
  if (path.startsWith('/products')) return <Products />;
  if (path.startsWith('/settings')) return <Settings />;
  return <Dashboard />;
}

function Shell() {
  const path = useRoute();
  const [state, setState] = useState({ loading: true });

  const load = useCallback(async () => {
    const [lic, company, settings] = await Promise.all([status(), kvGet('company'), kvGet('settings', {})]);
    setState({ loading: false, lic, company, settings });
    return lic;
  }, []);

  /** Check the license with the server when it is due (never blocks working offline). */
  const check = useCallback(
    async (force = false) => {
      const lic = await status();
      if (lic.state === 'none' || (!force && !lic.needsCheck) || navigator.onLine === false) return lic;
      try {
        const next = await refresh();
        await load();
        return next;
      } catch (e) {
        if (force) throw e;
        return lic;
      }
    },
    [load],
  );

  useEffect(() => {
    load().then(() => check());
    const online = () => check();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [load, check]);

  const saveCompany = async (company) => {
    await kvSet('company', company);
    setState((s) => ({ ...s, company }));
  };
  const saveSettings = async (settings) => {
    await kvSet('settings', settings);
    setState((s) => ({ ...s, settings }));
  };

  if (state.loading) {
    return (
      <div className="gate center">
        <img src="/app/icons/icon-192.png" alt="" width="72" height="72" style={{ margin: '0 auto' }} />
      </div>
    );
  }
  const ctx = { ...state, reload: load, check, saveCompany, saveSettings };
  let body;
  const main = TABS.some(([p]) => p === path) || path === '';
  if (state.lic.state === 'none') body = <Activation onDone={load} message={state.lic.message} />;
  else if (state.lic.state !== 'active') body = <Locked />;
  else if (!state.company?.name) body = <Setup />;
  else
    body = (
      <div className={`app ${main ? '' : 'no-tabs'}`}>
        <Screen path={path} />
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
