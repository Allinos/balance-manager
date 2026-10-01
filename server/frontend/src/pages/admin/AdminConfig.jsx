import { useEffect, useState } from 'react';
import { adminApi, dateTime } from '../../api.js';
import { Check, ErrorText, Field, Input, Spinner, useLoad, useToast } from '../../components/ui.jsx';

export default function AdminConfig() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => adminApi.get('/config'), []);
  const [form, setForm] = useState(null);
  const [saveError, setSaveError] = useState(null);
  useEffect(() => {
    if (data) setForm(structuredClone(data.config));
  }, [data]);
  if (loading || !form) return error ? <ErrorText error={error} /> : <Spinner />;

  const set = (path, value) => {
    const next = structuredClone(form);
    const keys = path.split('.');
    let obj = next;
    for (const k of keys.slice(0, -1)) obj = obj[k];
    obj[keys.at(-1)] = value;
    setForm(next);
  };
  const videos = form.help.videos || [];

  const save = async (e) => {
    e.preventDefault();
    setSaveError(null);
    try {
      await adminApi.put('/config', {
        configIntervalDays: Number(form.configIntervalDays),
        adPolicy: {
          minDaysBetweenAds: Number(form.adPolicy.minDaysBetweenAds),
          maxPerMonth: Number(form.adPolicy.maxPerMonth),
          firstOpenDelayDays: Number(form.adPolicy.firstOpenDelayDays),
        },
        defaultAdEnabled: !!form.defaultAdEnabled,
        app: form.app,
        help: { youtubeChannel: form.help.youtubeChannel || '', videos: videos.filter((v) => v.title && v.url) },
      });
      toast('Configuration saved. Apps receive it at their next check.');
      reload();
    } catch (err) {
      setSaveError(err);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Desktop app settings</h1>
          <p className="muted">
            Version {data.version} · last updated {dateTime(data.updatedAt)}
          </p>
        </div>
      </div>
      <form className="form" onSubmit={save}>
        <ErrorText error={saveError} />
        <div className="card">
          <h3>Configuration checks</h3>
          <div className="grid-3">
            <Field label="Check interval (days)" hint="Default 30 (monthly). Offline apps check as soon as they are back online.">
              <Input type="number" min="1" max="365" value={form.configIntervalDays} onChange={(v) => set('configIntervalDays', v)} data-testid="config-interval" />
            </Field>
            <div className="field">
              <span className="field-label">Next check</span>
              <span>Each app checks again {form.configIntervalDays} days after its last successful check.</span>
            </div>
            <div className="field">
              <span className="field-label">Checks in the last days</span>
              <span className="small">
                {data.recentChecks.slice(0, 7).map((c) => `${c.day.slice(5)}: ${c.count}`).join(' · ') || 'none yet'}
              </span>
            </div>
          </div>
        </div>
        <div className="card">
          <h3>Ads</h3>
          <div className="grid-3">
            <Field label="Minimum days between any two ads">
              <Input type="number" min="0" value={form.adPolicy.minDaysBetweenAds} onChange={(v) => set('adPolicy.minDaysBetweenAds', v)} />
            </Field>
            <Field label="Maximum ads per month">
              <Input type="number" min="0" max="31" value={form.adPolicy.maxPerMonth} onChange={(v) => set('adPolicy.maxPerMonth', v)} />
            </Field>
            <Field label="No ads for the first … days after install">
              <Input type="number" min="0" value={form.adPolicy.firstOpenDelayDays} onChange={(v) => set('adPolicy.firstOpenDelayDays', v)} />
            </Field>
          </div>
          <Check checked={form.defaultAdEnabled} onChange={(v) => set('defaultAdEnabled', v)} label="Show the built-in DocGen message when no ad is running" />
        </div>
        <div className="card">
          <h3>Application</h3>
          <div className="grid-3">
            <Field label="Latest version">
              <Input value={form.app.latestVersion} onChange={(v) => set('app.latestVersion', v)} />
            </Field>
            <Field label="Download page (https)" hint="Used only when no installer is uploaded under Downloads">
              <Input value={form.app.downloadUrl} onChange={(v) => set('app.downloadUrl', v)} />
            </Field>
            <Field label="Message shown in the app (optional)">
              <Input value={form.app.message} onChange={(v) => set('app.message', v)} maxLength={300} />
            </Field>
          </div>
        </div>
        <div className="card">
          <h3>Help &amp; Support videos</h3>
          <Field label="YouTube channel (https)">
            <Input value={form.help.youtubeChannel} onChange={(v) => set('help.youtubeChannel', v)} />
          </Field>
          <table className="table compact">
            <thead>
              <tr>
                <th>Title</th>
                <th>YouTube link</th>
                <th>Duration</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {videos.map((v, i) => (
                <tr key={i}>
                  <td>
                    <Input value={v.title} onChange={(x) => set(`help.videos.${i}.title`, x)} />
                  </td>
                  <td>
                    <Input value={v.url} onChange={(x) => set(`help.videos.${i}.url`, x)} placeholder="https://www.youtube.com/watch?v=…" />
                  </td>
                  <td>
                    <Input value={v.duration || ''} onChange={(x) => set(`help.videos.${i}.duration`, x)} placeholder="4:30" />
                  </td>
                  <td>
                    <button type="button" className="btn btn-sm" onClick={() => set('help.videos', videos.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn btn-sm" onClick={() => set('help.videos', [...videos, { title: '', url: '', description: '', duration: '' }])}>
            Add video
          </button>
        </div>
        <div className="row end sticky-save">
          <button className="btn btn-primary" data-testid="save-config">
            Save configuration
          </button>
        </div>
      </form>
    </>
  );
}
