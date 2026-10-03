/**
 * Downloads for paying customers, as set up in Admin → Downloads: Windows / macOS / Linux installers
 * (personal links that expire after 30 minutes, or a link the admin entered) and DocGen Mobile.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clientApi } from '../api.js';
import { useLoad } from './ui.jsx';
import Icon from './Icons.jsx';

export const fileSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const guessPlatform = () => {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|Mobile/i.test(ua)) return 'mobile';
  return /Mac/i.test(ua) ? 'macos' : /Linux/i.test(ua) ? 'linux' : 'windows';
};
export const PLATFORM_INFO = {
  windows: { icon: 'monitor', text: 'Windows 10 and 11 (64-bit). Installer (.exe) — double-click to install.' },
  macos: { icon: 'monitor', text: 'Apple Silicon and Intel Macs, macOS 10.15 or later (.dmg).' },
  linux: { icon: 'linux', text: 'Ubuntu, Debian, Fedora and other 64-bit distributions.' },
  mobile: { icon: 'phone', text: 'Android phones and tablets (install from the browser); also works on iPhone.' },
};

/** Opens a personal download link, fetching a fresh one if the page has been open for a while. */
function useOpen(reload) {
  const [loadedAt] = useState(Date.now());
  return async (file) => {
    if (file.type === 'file' && Date.now() - loadedAt > 25 * 60000) {
      const fresh = await clientApi.get('/downloads');
      const again = fresh.files.find((f) => f.platform === file.platform);
      if (again) window.location.href = again.url;
      reload();
      return;
    }
    if (file.type === 'link') window.open(file.url, '_blank', 'noopener');
    else window.location.href = file.url;
  };
}

/** Compact download box (after payment, on the success page). */
export function DownloadCard() {
  const { data, loading, reload } = useLoad(() => clientApi.get('/downloads'), []);
  const open = useOpen(reload);
  if (loading || !data?.entitled) return null;
  const mine = guessPlatform();
  const files = [...data.files].sort((a, b) => (b.platform === mine) - (a.platform === mine));
  return (
    <div className="card download-card" data-testid="download-card">
      <div className="download-text">
        <strong>Download DocGen{data.version ? ` ${data.version}` : ''}</strong>
        <p className="muted">Install it, open it and enter your license key.</p>
      </div>
      <div className="download-buttons">
        {files.map((f, i) =>
          f.type === 'page' ? (
            <Link key={f.platform} className={`btn ${i === 0 ? 'btn-primary' : ''}`} to="/mobile" data-testid="download-mobile">
              <Icon name="phone" size={16} /> Mobile app
            </Link>
          ) : (
            <button key={f.platform} className={`btn ${i === 0 ? 'btn-primary' : ''}`} onClick={() => open(f)} data-testid={`download-${f.platform}`}>
              Download for {f.label}
              {f.size ? <small>{fileSize(f.size)}</small> : null}
            </button>
          ),
        )}
        {!files.length && <span className="muted small">The installer will be available here shortly.</span>}
      </div>
    </div>
  );
}

/** Full list (Client panel → Downloads). */
export function DownloadList() {
  const { data, loading, reload } = useLoad(() => clientApi.get('/downloads'), []);
  const open = useOpen(reload);
  if (loading) return null;
  if (!data?.entitled) {
    return (
      <div className="card download-card" data-testid="download-locked">
        <div className="download-text">
          <strong>Downloads are available with a license</strong>
          <p className="muted">Buy a license and download DocGen for Windows, macOS, Linux and mobile.</p>
        </div>
        <Link to="/account/services" className="btn btn-primary">
          See plans and prices
        </Link>
      </div>
    );
  }
  const mine = guessPlatform();
  return (
    <div className="download-grid" data-testid="download-list">
      {data.files.map((f) => {
        const info = PLATFORM_INFO[f.platform];
        return (
          <section key={f.platform} className={`card download-tile ${f.platform === mine ? 'recommended' : ''}`} data-testid={`tile-${f.platform}`}>
            <span className="download-tile-icon">
              <Icon name={info.icon} size={24} />
            </span>
            <div className="download-tile-body">
              <div className="row">
                <h3>{f.platform === 'mobile' ? 'DocGen Mobile' : f.label}</h3>
                {f.platform === mine && <span className="badge tone-info">This device</span>}
              </div>
              <p className="muted small">{info.text}</p>
              {f.fileName && (
                <p className="muted small mono">
                  {f.fileName} · {fileSize(f.size)}
                </p>
              )}
            </div>
            {f.type === 'page' ? (
              <Link className="btn btn-primary" to="/mobile" data-testid="download-mobile">
                Get the mobile app
              </Link>
            ) : (
              <button className="btn btn-primary" onClick={() => open(f)} data-testid={`download-${f.platform}`}>
                <Icon name={f.type === 'link' ? 'link' : 'download'} size={16} /> Download
              </button>
            )}
          </section>
        );
      })}
      {!data.files.length && <p className="muted">Downloads will be available here shortly.</p>}
    </div>
  );
}
