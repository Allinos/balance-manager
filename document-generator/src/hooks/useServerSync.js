import { useEffect } from 'react';
import { useAppData } from './useAppData.jsx';
import { checkServerConfig } from '../services/remoteConfig.js';

const STARTUP_DELAY_MS = 3000;
const PERIODIC_MS = 6 * 3600000;

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

  useEffect(() => {
    if (!enabled || !serverConfigured) return undefined;
    const run = async () => {
      const result = await checkServerConfig({ serverConfigured, licensed });
      if (result.checked && licensed) await setLicense().catch(() => {});
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
