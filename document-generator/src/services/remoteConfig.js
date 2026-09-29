/**
 * Periodic server configuration check.
 *
 * State (stored locally in the ad_state table):
 *   lastConfigFetchAt   last successful check (ms)
 *   nextConfigCheckAt   when the next check is due (ms) = last success + interval from the server
 *   lastConfigAttemptAt last attempt, used for a short back-off after failures
 *   cachedConfig        last valid configuration (used while offline / server down)
 *   lastConfigVersion   version number of the cached configuration
 *
 * The check does not depend on being online at an exact time: whenever the app
 * starts, every few hours while it runs, and whenever the computer comes back
 * online, it looks at nextConfigCheckAt and fetches if the check is due.
 * Example: interval 30 days, offline for 10 days after the due date → the check
 * runs as soon as the connection returns and the next one is scheduled 30 days
 * after that successful check.
 */

import { call } from './api.js';
import { refreshLicense } from './licenseService.js';

const DAY = 86400000;
const DEFAULT_INTERVAL_DAYS = 30;
/** After a failed attempt wait this long before trying again. */
const RETRY_AFTER_FAILURE_MS = 6 * 3600000;

let clockOffset = 0;
/** Debug builds can shift the clock for automated tests (see app_info.clockOffsetMs). */
export const setClockOffset = (ms) => {
  clockOffset = Number(ms) || 0;
};
export const now = () => Date.now() + clockOffset;

export const getAdState = () => call('ad_state_get');
export const setAdState = (values) => call('ad_state_set', { values });

/** Is a configuration check due at time `t`? */
export function isCheckDue(state, t = now()) {
  const next = Number(state.nextConfigCheckAt || 0);
  if (next && t < next) return false;
  const lastAttempt = Number(state.lastConfigAttemptAt || 0);
  const lastFetch = Number(state.lastConfigFetchAt || 0);
  if (lastAttempt > lastFetch && t - lastAttempt < RETRY_AFTER_FAILURE_MS) return false;
  return true;
}

let running = null;

/**
 * Check the server configuration if due (or `force`). Never throws.
 * @returns {Promise<{checked: boolean, config: object|null, error?: string}>}
 */
export function checkServerConfig({ force = false, serverConfigured = true, licensed = false } = {}) {
  if (running) return running;
  running = (async () => {
    try {
      const state = await getAdState();
      const t = now();
      if (!serverConfigured) return { checked: false, config: state.cachedConfig || null };
      if (!force && !isCheckDue(state, t)) return { checked: false, config: state.cachedConfig || null };
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return { checked: false, config: state.cachedConfig || null };
      await setAdState({ lastConfigAttemptAt: t });
      try {
        const config = await call('remote_config_fetch');
        const interval = Math.max(1, Number(config.configIntervalDays) || DEFAULT_INTERVAL_DAYS);
        await setAdState({
          cachedConfig: config,
          lastConfigFetchAt: t,
          nextConfigCheckAt: t + interval * DAY,
          lastConfigVersion: config.version,
        });
        // Renewals, extensions and suspensions are picked up on the same schedule.
        if (licensed) await refreshLicense().catch(() => {});
        return { checked: true, config };
      } catch (e) {
        return { checked: false, config: state.cachedConfig || null, error: e.message };
      }
    } catch (e) {
      return { checked: false, config: null, error: e.message };
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Summary for Settings → About / Help. */
export async function configSummary() {
  const s = await getAdState();
  return {
    lastCheck: s.lastConfigFetchAt ? new Date(Number(s.lastConfigFetchAt)) : null,
    nextCheck: s.nextConfigCheckAt ? new Date(Number(s.nextConfigCheckAt)) : null,
    version: s.lastConfigVersion ?? null,
    intervalDays: s.cachedConfig?.configIntervalDays ?? null,
  };
}
