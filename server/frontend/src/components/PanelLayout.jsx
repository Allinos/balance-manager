/**
 * Layout of the client panel and the admin panel: a sidebar with the main sections on wide screens;
 * on phones and small tablets a top bar with a menu button that slides the same sidebar in.
 */

import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon from './Icons.jsx';

/**
 * @param {{ tone: 'light'|'dark', home: string, groups: {label?: string, items: {to: string, label: string, icon: string, end?: boolean}[]}[],
 *           user: {name: string, detail: string}, onSignOut: () => void, badge?: string }} props
 */
export default function PanelLayout({ tone, home, groups, user, onSignOut, badge }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const brand = (
    <Link to={home} className="brand" aria-label="DocGen home">
      <img src="/logo.png" alt="" />
      <span>
        <strong className="wordmark">
          <span className="brand-doc">Doc</span>
          <span className="brand-gen">Gen</span>
        </strong>
        {badge && <small className="panel-badge">{badge}</small>}
      </span>
    </Link>
  );

  return (
    <div className={`panel panel-${tone} ${open ? 'menu-open' : ''}`}>
      <header className="panel-topbar">
        <button className="icon-btn panel-menu-btn" onClick={() => setOpen(true)} aria-label="Open menu" data-testid="menu-open">
          <Icon name="menu" size={22} />
        </button>
        {brand}
      </header>
      <div className="panel-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className="panel-side" aria-label="Main menu">
        <div className="panel-side-head">
          {brand}
          <button className="icon-btn panel-close-btn" onClick={() => setOpen(false)} aria-label="Close menu">
            <Icon name="x" size={20} />
          </button>
        </div>
        {groups.map((g, i) => (
          <nav key={g.label || i} className="panel-nav" aria-label={g.label || 'Menu'}>
            {g.label && <div className="panel-nav-label">{g.label}</div>}
            {g.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end} data-testid={`nav-${it.label.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                <Icon name={it.icon} size={18} />
                <span>{it.label}</span>
              </NavLink>
            ))}
          </nav>
        ))}
        <div className="panel-user">
          <span className="panel-avatar" aria-hidden="true">
            {(user.name || '?').trim().charAt(0).toUpperCase()}
          </span>
          <span className="panel-user-text">
            <strong>{user.name}</strong>
            <small>{user.detail}</small>
          </span>
          <button className="icon-btn" onClick={onSignOut} title="Sign out" aria-label="Sign out" data-testid="sign-out">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>
      <main className="panel-main">
        <div className="panel-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
