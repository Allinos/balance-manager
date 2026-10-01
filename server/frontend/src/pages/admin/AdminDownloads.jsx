/** Installers paying customers download from their account and from the purchase email (one per platform). */

import { useState } from 'react';
import { adminApi, dateTime } from '../../api.js';
import { ErrorText, Spinner, useDialog, useLoad, useToast } from '../../components/ui.jsx';

const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function AdminDownloads() {
  const toast = useToast();
  const dialog = useDialog();
  const { data, loading, error, reload } = useLoad(() => adminApi.get('/downloads'), []);
  const [busy, setBusy] = useState('');
  if (loading) return <Spinner />;
  if (error) return <ErrorText error={error} />;

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
            The DocGen installer customers get after paying — on the success page, in their account and in the purchase email. Upload a new version here; every
            customer gets it from then on.
          </p>
        </div>
      </div>
      {!data.installers.length && (
        <div className="alert alert-warn">
          No installer uploaded yet.
          {data.externalUrl
            ? ' Customers are sent to the download page set in Desktop app settings.'
            : ' Customers cannot download DocGen until you upload it.'}
        </div>
      )}
      <div className="card">
        {data.platforms.map((p) => {
          const installer = data.installers.find((i) => i.platform === p.id);
          return (
            <div key={p.id} className="installer-row">
              <strong>{p.label}</strong>
              <span className={installer ? '' : 'muted'}>
                {installer ? (
                  <>
                    {installer.fileName}{' '}
                    <span className="muted small">
                      · {size(installer.size)} · uploaded {dateTime(installer.uploadedAt)}
                    </span>
                  </>
                ) : (
                  `No installer (${p.extensions.join(', ')})`
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
          );
        })}
      </div>
      <p className="muted small">Download links are personal: 30 minutes on the website, 7 days in emails, and only for customers with an active license.</p>
    </>
  );
}
