import { useEffect, useRef } from 'react';
import { useAppData } from './useAppData.jsx';
import { checkServerConfig } from '../services/remoteConfig.js';
import { refreshLicense } from '../services/licenseService.js';

const STARTUP_DELAY_MS = 3000;
const PERIODIC_MS = 6 * 3600000;
const LICENSE_CHECK_DAYS = 7;

/**
 * Should the stored license be checked with the server now? Weekly, and at every start
 * while it is close to its end or no longer active (so a renewal or a suspension shows up soon).
 */
export function licenseCheckDue(license, now = Date.now()) {
  if (!license?.license) return false;
  const l = license.license;
  if (l.status !== 'active') return true;
  if (l.daysLeft !== null && l.daysLeft !== undefined && l.daysLeft <= 30) return true;
  const last = license.lastRefreshAt ? Date.parse(license.lastRefreshAt) : 0;
  return !last || now - last > LICENSE_CHECK_DAYS * 86400000;
}

/**
 * Keep server configuration (ads, help videos, license status) fresh:
 * checks at startup, every 6 hours while running, and whenever the computer
 * comes back online. `checkServerConfig` itself decides whether a check is due.
 * Never shows errors — the app works the same without a connection.
 */
export function useServerSync(enabled) {
  const { license, setLicense } = useAppData();
  const serverConfigured = !!license?.serverConfigured;
  const licensed = !!license?.licensed;
  const licenseRef = useRef(license);
  licenseRef.current = license;

  useEffect(() => {
    if (!enabled || !serverConfigured) return undefined;
    const run = async () => {
      const result = await checkServerConfig({ serverConfigured, licensed });
      if (result.checked && licensed) await setLicense().catch(() => {});
      else if (navigator.onLine !== false && licenseCheckDue(licenseRef.current)) {
        await refreshLicense().then(setLicense).catch(() => {});
      }
    };
    const first = setTimeout(run, STARTUP_DELAY_MS);
    const periodic = setInterval(run, PERIODIC_MS);
    window.addEventListener('online', run);
    return () => {
      clearTimeout(first);
      clearInterval(periodic);
      window.removeEventListener('online', run);
    };
  }, [enabled, serverConfigured, licensed, setLicense]);
}
