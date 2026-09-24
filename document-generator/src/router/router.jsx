/**
 * Minimal hash router (no dependency). Routes look like `#/documents` or
 * `#/doc/new/TAX_INVOICE?from=12&mode=convert`.
 *
 * A single "leave guard" lets the document editor warn about unsaved changes.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const RouterContext = createContext(null);

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/dashboard';
  const [path, query = ''] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(query)) };
}

let leaveGuard = null;
/** Async confirmation used by the leave guard (set by the UI layer). */
let confirmLeave = async (message) => window.confirm(message);

export function setLeaveConfirm(fn) {
  confirmLeave = fn;
}

/** Register a function returning a confirmation message (or '' to allow leaving). */
export function setLeaveGuard(fn) {
  leaveGuard = fn;
}

export function RouterProvider({ children }) {
  const [location, setLocation] = useState(parseHash);

  useEffect(() => {
    const onChange = () => setLocation(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback(async (to, { replace = false, force = false } = {}) => {
    if (!force && leaveGuard) {
      const message = leaveGuard();
      if (message && !(await confirmLeave(message))) return false;
    }
    leaveGuard = null;
    const target = `#${to}`;
    if (replace) window.history.replaceState(null, '', target);
    else window.history.pushState(null, '', target);
    setLocation(parseHash());
    window.scrollTo(0, 0);
    return true;
  }, []);

  const value = useMemo(() => ({ ...location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

/** @returns {{path: string, query: Record<string,string>, navigate: (to: string, opts?: {replace?: boolean, force?: boolean}) => Promise<boolean>}} */
export const useRouter = () => useContext(RouterContext);

/**
 * Match `pattern` like `/doc/:id/edit` against `path`.
 * @returns {Record<string,string>|null}
 */
export function matchPath(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i += 1) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function Link({ to, children, className, ...rest }) {
  const { navigate } = useRouter();
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
