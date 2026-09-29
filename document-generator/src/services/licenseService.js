/** Licensing: status, account sign-in, activation codes, refresh, sign-out. */

import { call } from './api.js';

/**
 * @typedef {Object} LicenseStatus
 * @property {'licensed'|'trial'|'expired'} mode
 * @property {boolean} licensed
 * @property {number} trialDaysLeft
 * @property {string} trialEndsAt
 * @property {Object|null} license        plan, email, business, expiresAt, daysLeft, status…
 * @property {string|null} licenseProblem 'expired' | 'suspended' | 'revoked' | 'invalid'
 * @property {string} deviceId
 * @property {string} deviceName
 * @property {boolean} serverConfigured
 * @property {string} registerUrl         portal page for creating an account
 * @property {string} portalUrl
 */

/** @returns {Promise<LicenseStatus>} */
export const getLicenseStatus = () => call('license_status');
export const loginWithAccount = (email, password) => call('license_login', { email, password });
export const activateWithCode = (code) => call('license_activate', { code });
export const refreshLicense = () => call('license_refresh');
export const signOutLicense = () => call('license_logout');

/** Format user input as AB12-CD34-EF56 while typing (uppercase letters and digits only). */
export function formatActivationCode(input) {
  const raw = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return raw.match(/.{1,4}/g)?.join('-') || '';
}

export const isValidActivationCode = (code) => /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code);
