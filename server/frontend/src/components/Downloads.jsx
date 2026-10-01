/**
 * "Download DocGen" for paying customers. Links are personal and expire after 30 minutes,
 * so they are fetched when shown (and again on click if the page stayed open).
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clientApi } from '../api.js';
import { useLoad } from './ui.jsx';

const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const guessPlatform = () => {
  const ua = navigator.userAgent;
  return /Mac/i.test(ua) ? 'macos' : /Linux/i.test(ua) && !/Android/i.test(ua) ? 'linux' : 'windows';
};

export function DownloadCard({ compact = false }) {
  const { data, loading, reload } = useLoad(() => clientApi.get('/downloads'), []);
  const [loadedAt] = useState(Date.now());
  if (loading || !data) return null;

  if (!data.entitled) {
    if (compact) return null;
    return (
      <div className="card download-card" data-testid="download-locked">
        <div className="download-text">
          <strong>Download DocGen</strong>
          <p className="muted">The download is available as soon as you buy DocGen.</p>
        </div>
        <Link to="/buy" className="btn btn-primary">
          Buy DocGen
        </Link>
      </div>
    );
  }

  const mine = guessPlatform();
  const files = [...data.files].sort((a, b) => (b.platform === mine) - (a.platform === mine));
  const open = async (file) => {
    // Links expire after 30 minutes; refresh them if this page has been open for a while.
    if (Date.now() - loadedAt > 25 * 60000) {
      const fresh = await clientApi.get('/downloads');
      const again = fresh.files.find((f) => f.platform === file.platform);
      if (again) window.location.href = again.url;
      reload();
      return;
    }
    window.location.href = file.url;
  };

  return (
    <div className="card download-card" data-testid="download-card">
      <div className="download-text">
        <strong>Download DocGen{data.version ? ` ${data.version}` : ''}</strong>
        <p className="muted">Install it, open it and enter your license code.</p>
      </div>
      <div className="download-buttons">
        {files.map((f, i) => (
          <button key={f.platform} className={`btn ${i === 0 ? 'btn-primary' : ''}`} onClick={() => open(f)} data-testid={`download-${f.platform}`}>
            Download for {f.label}
            <small>{size(f.size)}</small>
          </button>
        ))}
        {!files.length && data.externalUrl && (
          <a className="btn btn-primary" href={data.externalUrl} target="_blank" rel="noreferrer">
            Download DocGen
          </a>
        )}
        {!files.length && !data.externalUrl && <span className="muted small">The installer will be available here shortly.</span>}
      </div>
    </div>
  );
}
