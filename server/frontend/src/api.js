/**
 * Small fetch wrapper for the DocGen API. Client and admin sessions are kept
 * separately in sessionStorage-backed localStorage keys.
 */

const KEYS = { client: 'docgen.portal.token', admin: 'docgen.admin.token' };

export const session = {
  get: (kind) => {
    try {
      return localStorage.getItem(KEYS[kind]) || '';
    } catch {
      return '';
    }
  },
  set: (kind, token) => {
    try {
      if (token) localStorage.setItem(KEYS[kind], token);
      else localStorage.removeItem(KEYS[kind]);
    } catch {
      /* storage unavailable */
    }
  },
};

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * @param {'client'|'admin'|null} kind  which session token to send
 * @param {string} method
 * @param {string} url
 * @param {object} [body]
 */
/**
 * A reply without DocGen's own error came from something in front of the server (Nginx, Cloudflare, a load
 * balancer) — say what usually causes it instead of a vague message.
 */
export function proxyMessage(status) {
  if (status === 413) {
    return 'The file is too large for the web server in front of DocGen (HTTP 413). Raise the upload limit — Nginx: client_max_body_size 700m; Cloudflare allows at most 100 MB per upload — or paste a download link instead.';
  }
  if (status === 502 || status === 503) return `The DocGen server is not reachable behind the web server (HTTP ${status}). Check that it is running (pm2 status / pm2 logs).`;
  if (status === 504 || status === 524) {
    return `The web server stopped waiting for DocGen (HTTP ${status}). For large uploads raise the proxy timeouts (Nginx: proxy_read_timeout / proxy_send_timeout 600s).`;
  }
  return status ? `Something went wrong (HTTP ${status}).` : 'Something went wrong.';
}

export async function request(kind, method, url, body) {
  const token = kind ? session.get(kind) : '';
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your internet connection.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && kind) {
      session.set(kind, '');
      window.dispatchEvent(new CustomEvent('docgen:signed-out', { detail: kind }));
    }
    throw new ApiError(res.status, data.error?.code || 'ERROR', data.error?.message || proxyMessage(res.status), data.error?.details);
  }
  return data;
}

export const clientApi = {
  get: (url) => request('client', 'GET', `/api/portal${url}`),
  post: (url, body = {}) => request('client', 'POST', `/api/portal${url}`, body),
  put: (url, body = {}) => request('client', 'PUT', `/api/portal${url}`, body),
};

export const adminApi = {
  get: (url) => request('admin', 'GET', `/api/admin${url}`),
  post: (url, body = {}) => request('admin', 'POST', `/api/admin${url}`, body),
  put: (url, body = {}) => request('admin', 'PUT', `/api/admin${url}`, body),
  del: (url) => request('admin', 'DELETE', `/api/admin${url}`),
};

export const qs = (params) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v !== undefined && v !== null) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const money = (amount, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);

export const date = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const validity = (lic) => (lic.lifetime ? 'Lifetime' : lic.expiresAt ? date(lic.expiresAt) : `${lic.durationDays} days from activation`);
