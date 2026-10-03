/**
 * Admin → Downloads: what customers can download from their account and the purchase email.
 *   Windows / macOS / Linux — switch on/off; upload the installer, or give a link (e.g. a GitHub release).
 *   Mobile — switch DocGen Mobile on/off (customers get the /mobile installation page).
 */

import { useEffect, useState } from 'react';
import { adminApi, dateTime } from '../../api.js';
import { Check, ErrorText, Input, Spinner, useDialog, useLoad, useToast } from '../../components/ui.jsx';

const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function AdminDownloads() {
  const toast = useToast();
  const dialog = useDialog();
  const { data, loading, error, reload } = useLoad(() => adminApi.get('/downloads'), []);
  const [busy, setBusy] = useState('');
  const [settings, setSettings] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState(null);
  useEffect(() => {
    if (data) setSettings(structuredClone(data.settings));
  }, [data]);
  if (loading || !settings) return error ? <ErrorText error={error} /> : <Spinner />;

  const change = (platform, patch) => {
    setSettings({ ...settings, [platform]: { ...settings[platform], ...patch } });
    setDirty(true);
  };
  const save = async () => {
    setSaveError(null);
    try {
      const r = await adminApi.put('/downloads/settings', settings);
      setSettings(r.settings);
      setDirty(false);
      toast('Downloads updated. Customers see the change at once.');
    } catch (e) {
      setSaveError(e);
    }
  };
  const upload = async (platform, file) => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setBusy(platform);
    try {
      await adminApi.post(`/downloads/${platform}`, form);
      toast(`${file.name} uploaded. Paying customers can download it now.`);
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy('');
    }
  };
  const remove = async (p, installer) => {
    const ok = await dialog.confirm({
      title: `Remove the ${p.label} installer?`,
      message: `${installer.fileName} will no longer be offered to customers.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    await adminApi.del(`/downloads/${p.id}`);
    toast('Installer removed');
    reload();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Downloads</h1>
          <p className="muted">
            What customers with a license can download — in their account (Downloads), after payment and in the purchase email.
          </p>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={!dirty} data-testid="save-downloads">
          Save changes
        </button>
      </div>
      <ErrorText error={saveError} />
      <div className="download-admin-list">
        {data.platforms.map((p) => {
          const installer = data.installers.find((i) => i.platform === p.id);
          const s = settings[p.id];
          const offered = s.enabled && (installer || s.url);
          return (
            <section key={p.id} className="card download-admin" data-testid={`admin-download-${p.id}`}>
              <div className="download-admin-head">
                <h3>{p.label}</h3>
                <Check checked={s.enabled} onChange={(v) => change(p.id, { enabled: v })} label="Offer to customers" />
                <span className={`badge ${offered ? 'tone-good' : 'tone-muted'}`}>{offered ? 'Available' : s.enabled ? 'Nothing to download yet' : 'Hidden'}</span>
              </div>
              <div className="installer-row">
                <strong>Installer file</strong>
                <span className={installer ? '' : 'muted'}>
                  {installer ? (
                    <>
                      {installer.fileName}{' '}
                      <span className="muted small">
                        · {size(installer.size)} · uploaded {dateTime(installer.uploadedAt)}
                      </span>
                    </>
                  ) : (
                    `No file (${p.extensions.join(', ')})`
                  )}
                </span>
                <span className="row">
                  <label className={`btn btn-sm ${installer ? '' : 'btn-primary'}`}>
                    {busy === p.id ? 'Uploading…' : installer ? 'Replace' : 'Upload'}
                    <input
                      type="file"
                      hidden
                      accept={p.extensions.join(',')}
                      disabled={!!busy}
                      onChange={(e) => {
                        upload(p.id, e.target.files[0]);
                        e.target.value = '';
                      }}
                      data-testid={`upload-${p.id}`}
                    />
                  </label>
                  {installer && (
                    <button type="button" className="btn btn-sm" onClick={() => remove(p, installer)}>
                      Remove
                    </button>
                  )}
                </span>
              </div>
              <div className="installer-row">
                <strong>Or a link</strong>
                <Input
                  value={s.url}
                  onChange={(v) => change(p.id, { url: v })}
                  placeholder="https://… (used when no file is uploaded)"
                  data-testid={`link-${p.id}`}
                />
                <span />
              </div>
            </section>
          );
        })}
        <section className="card download-admin" data-testid="admin-download-mobile">
          <div className="download-admin-head">
            <h3>Mobile (DocGen Mobile)</h3>
            <Check checked={settings.mobile.enabled} onChange={(v) => change('mobile', { enabled: v })} label="Offer to customers" />
            <span className={`badge ${settings.mobile.enabled ? 'tone-good' : 'tone-muted'}`}>{settings.mobile.enabled ? 'Available' : 'Hidden'}</span>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            The installable web app for Android and iPhone. Customers get a “Get the mobile app” button that opens the{' '}
            <a href="/mobile" target="_blank" rel="noreferrer">
              installation page
            </a>
            ; the website shows a “DocGen on Mobile” section. How many phones a license may use is set per product (Products &amp; pricing) and per
            license (Licenses).
          </p>
        </section>
      </div>
      <p className="muted small">File links are personal: 30 minutes on the website, 7 days in emails, and only for customers with an active license.</p>
    </>
  );
}
