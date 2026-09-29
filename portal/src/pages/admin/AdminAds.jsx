import { useState } from 'react';
import { adminApi, date, request } from '../../api.js';
import { Badge, Check, Empty, ErrorText, Field, Input, Modal, Select, Spinner, Textarea, useLoad, useToast } from '../../components/ui.jsx';

const blank = {
  title: '', description: '', imageUrl: '', html: '', linkUrl: '', ctaText: 'Learn more', isActive: true, startAt: '', endAt: '',
  frequencyDays: 7, maxPerMonth: 4, priority: 0, target: { licenseStatus: 'all', platforms: [], minVersion: '', maxVersion: '' },
};

/** Same layout the desktop app uses, so admins see what users will see. */
export function AdPreview({ ad }) {
  return (
    <div className="ad-preview">
      <div className="ad-preview-head">
        <span>Sponsored</span>
        <span>×</span>
      </div>
      {ad.imageUrl && <img src={ad.imageUrl} alt="" className="ad-preview-img" />}
      <div className="ad-preview-body">
        <strong>{ad.title || 'Ad title'}</strong>
        {ad.description && <p>{ad.description}</p>}
        {ad.html && <iframe title="HTML content" sandbox="" srcDoc={ad.html} className="ad-preview-html" />}
      </div>
      {ad.linkUrl && (
        <div className="ad-preview-foot">
          <span className="btn btn-primary btn-sm">{ad.ctaText || 'Learn more'}</span>
        </div>
      )}
    </div>
  );
}

function AdForm({ ad, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({
    ...blank,
    ...ad,
    startAt: ad?.startAt ? ad.startAt.slice(0, 10) : '',
    endAt: ad?.endAt ? ad.endAt.slice(0, 10) : '',
    target: { ...blank.target, ...(ad?.target || {}) },
  });
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm({ ...form, [k]: v });
  const setTarget = (k) => (v) => setForm({ ...form, target: { ...form.target, [k]: v } });

  const upload = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await request('admin', 'POST', '/api/admin/uploads', fd);
      set('imageUrl')(r.url);
    } catch (e) {
      toast(e.message, 'bad');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const body = {
      ...form,
      frequencyDays: Number(form.frequencyDays),
      maxPerMonth: Number(form.maxPerMonth),
      priority: Number(form.priority),
      startAt: form.startAt ? new Date(`${form.startAt}T00:00:00`).toISOString() : '',
      endAt: form.endAt ? new Date(`${form.endAt}T23:59:59`).toISOString() : '',
    };
    for (const k of ['id', 'stats', 'version', 'createdAt', 'updatedAt']) delete body[k];
    try {
      if (ad?.id) await adminApi.put(`/ads/${ad.id}`, body);
      else await adminApi.post('/ads', body);
      toast('Ad saved');
      onClose(true);
    } catch (err) {
      setError(err);
    }
  };

  return (
    <Modal title={ad?.id ? 'Edit ad' : 'New ad'} onClose={() => onClose(false)} wide>
      <div className="ad-editor">
        <form className="form" onSubmit={submit}>
          <ErrorText error={error} />
          <div className="grid-2">
            <Field label="Title" span>
              <Input value={form.title} onChange={set('title')} required maxLength={80} data-testid="ad-title" />
            </Field>
            <Field label="Description" span>
              <Input value={form.description} onChange={set('description')} maxLength={300} />
            </Field>
            <Field label="Image / banner URL" hint="https:// — or upload a PNG/JPG up to 2 MB" span>
              <div className="row">
                <Input value={form.imageUrl} onChange={set('imageUrl')} />
                <label className="btn btn-sm">
                  Upload
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => e.target.files[0] && upload(e.target.files[0])} />
                </label>
              </div>
            </Field>
            <Field label="Link (opens in browser)">
              <Input value={form.linkUrl} onChange={set('linkUrl')} placeholder="https://" />
            </Field>
            <Field label="Button text">
              <Input value={form.ctaText} onChange={set('ctaText')} maxLength={30} />
            </Field>
            <Field label="HTML content (optional)" hint="HTML + CSS only. Scripts never run." span>
              <Textarea rows={4} value={form.html} onChange={set('html')} className="input mono" />
            </Field>
            <Field label="Start date">
              <Input type="date" value={form.startAt} onChange={set('startAt')} />
            </Field>
            <Field label="End date">
              <Input type="date" value={form.endAt} onChange={set('endAt')} />
            </Field>
            <Field label="Show again after (days)">
              <Input type="number" min="0" value={form.frequencyDays} onChange={set('frequencyDays')} />
            </Field>
            <Field label="Max times per month">
              <Input type="number" min="0" max="31" value={form.maxPerMonth} onChange={set('maxPerMonth')} />
            </Field>
            <Field label="Show to">
              <Select
                value={form.target.licenseStatus}
                onChange={setTarget('licenseStatus')}
                options={[
                  { value: 'all', label: 'Everyone' },
                  { value: 'trial', label: 'Trial users only' },
                  { value: 'licensed', label: 'Licensed users only' },
                ]}
              />
            </Field>
            <Field label="Priority" hint="Higher shows first">
              <Input type="number" value={form.priority} onChange={set('priority')} />
            </Field>
            <Field label="Platforms (none = all)" span>
              <div className="row">
                {['windows', 'macos', 'linux'].map((p) => (
                  <Check
                    key={p}
                    label={p}
                    checked={form.target.platforms.includes(p)}
                    onChange={(on) => setTarget('platforms')(on ? [...form.target.platforms, p] : form.target.platforms.filter((x) => x !== p))}
                  />
                ))}
              </div>
            </Field>
            <Field label="Min app version">
              <Input value={form.target.minVersion} onChange={setTarget('minVersion')} placeholder="e.g. 1.0.0" />
            </Field>
            <Field label="Max app version">
              <Input value={form.target.maxVersion} onChange={setTarget('maxVersion')} />
            </Field>
          </div>
          <Check checked={form.isActive} onChange={set('isActive')} label="Active" />
          <div className="row end">
            <button type="button" className="btn" onClick={() => onClose(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" data-testid="save-ad">
              Save ad
            </button>
          </div>
        </form>
        <div>
          <div className="muted small">Preview</div>
          <AdPreview ad={form} />
        </div>
      </div>
    </Modal>
  );
}

export default function AdminAds() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => adminApi.get('/ads?pageSize=100'), []);
  const [editing, setEditing] = useState(null);
  const remove = async (a) => {
    if (!window.confirm(`Delete the ad "${a.title}"?`)) return;
    await adminApi.del(`/ads/${a.id}`);
    toast('Ad deleted');
    reload();
  };
  const now = Date.now();
  const running = (a) => a.isActive && (!a.startAt || Date.parse(a.startAt) <= now) && (!a.endAt || Date.parse(a.endAt) >= now);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ads</h1>
          <p className="muted">Shown in the desktop app as a small popup. Apps pick up changes at their next configuration check.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})} data-testid="new-ad">
          New ad
        </button>
      </div>
      <ErrorText error={error} />
      {loading ? (
        <Spinner />
      ) : !data?.rows.length ? (
        <Empty>No ads yet. When there are none, the desktop app shows only its built-in DocGen message (if enabled in App configuration).</Empty>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Ad</th>
                <th>Schedule</th>
                <th>Rules</th>
                <th>Shown / clicked</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.title}</strong>
                    <div className="muted small">{a.description}</div>
                  </td>
                  <td>
                    {date(a.startAt)} → {date(a.endAt)}
                  </td>
                  <td className="small">
                    every {a.frequencyDays} days · max {a.maxPerMonth}/month · {a.target.licenseStatus || 'all'}
                  </td>
                  <td>
                    {a.stats.AD_SHOWN || 0} / {a.stats.AD_CLICKED || 0}
                  </td>
                  <td>{running(a) ? <Badge status="active">running</Badge> : <Badge status="inactive">{a.isActive ? 'scheduled/ended' : 'inactive'}</Badge>}</td>
                  <td className="right nowrap">
                    <button className="btn btn-sm" onClick={() => setEditing(a)}>
                      Edit
                    </button>{' '}
                    <button className="btn btn-sm" onClick={() => remove(a)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <AdForm
          ad={editing}
          onClose={(changed) => {
            setEditing(null);
            if (changed) reload();
          }}
        />
      )}
    </>
  );
}
