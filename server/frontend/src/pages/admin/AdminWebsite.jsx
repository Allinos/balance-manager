/** Website content: headline, screenshots, up to two videos, comparison table. Price is set under Products. */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api.js';
import { Check, ErrorText, Field, Input, Spinner, Textarea, useLoad, useToast } from '../../components/ui.jsx';
import { embedUrl } from '../portal/ProductPage.jsx';

export default function AdminWebsite() {
  const toast = useToast();
  const { data, loading, error } = useLoad(() => adminApi.get('/site'), []);
  const [form, setForm] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (data) setForm(structuredClone(data.site));
  }, [data]);
  if (loading || !form) return error ? <ErrorText error={error} /> : <Spinner />;

  const set = (k) => (v) => setForm({ ...form, [k]: v });
  const shots = form.screenshots;
  const videos = form.videos;
  const setShot = (i, patch) => set('screenshots')(shots.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  const moveShot = (i, by) => {
    const next = [...shots];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    set('screenshots')(next);
  };
  const setVideo = (i, patch) => set('videos')(videos.map((v, n) => (n === i ? { ...v, ...patch } : v)));

  const upload = async (file) => {
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    setUploading(true);
    try {
      const r = await adminApi.post('/uploads', body);
      set('screenshots')([...shots, { url: r.url, caption: '' }]);
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setUploading(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaveError(null);
    try {
      const r = await adminApi.put('/site', { ...form, videos: videos.filter((v) => v.url) });
      setForm(structuredClone(r.site));
      toast('Website updated');
    } catch (err) {
      setSaveError(err);
    }
  };

  return (
    <form className="form" onSubmit={save}>
      <div className="page-head">
        <div>
          <h1>Website</h1>
          <p className="muted">
            What visitors see on the product page. The price comes from <Link to="/admin/products">Products &amp; pricing</Link>.
          </p>
        </div>
        <a className="btn" href="/" target="_blank" rel="noreferrer">
          View website
        </a>
      </div>
      <ErrorText error={saveError} />
      <div className="card form">
        <h3>Introduction</h3>
        <Field label="Headline" error={saveError?.details?.fields?.headline}>
          <Input value={form.headline} onChange={set('headline')} maxLength={120} required data-testid="site-headline" />
        </Field>
        <Field label="Short introduction">
          <Textarea rows={2} value={form.subheadline} onChange={set('subheadline')} maxLength={300} />
        </Field>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Screenshots</h3>
          <label className={`btn btn-sm ${uploading || shots.length >= 6 ? 'disabled' : ''}`}>
            {uploading ? 'Uploading…' : 'Add screenshot'}
            <input
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading || shots.length >= 6}
              onChange={(e) => {
                upload(e.target.files[0]);
                e.target.value = '';
              }}
              data-testid="upload-screenshot"
            />
          </label>
        </div>
        <p className="muted small" style={{ marginTop: -6, marginBottom: 12 }}>
          Up to 6 images (PNG, JPG or WEBP, 2 MB each). The first one is shown at the top of the page.
        </p>
        {!shots.length ? (
          <p className="muted">No screenshots.</p>
        ) : (
          <div className="thumbs">
            {shots.map((s, i) => (
              <div key={`${s.url}-${i}`} className="thumb">
                <img src={s.url} alt="" />
                <div className="row">
                  <Input value={s.caption} onChange={(v) => setShot(i, { caption: v })} placeholder="Caption" maxLength={80} />
                </div>
                <div className="row" style={{ paddingTop: 0 }}>
                  <button type="button" className="btn btn-sm" disabled={i === 0} onClick={() => moveShot(i, -1)} aria-label="Move left">
                    ←
                  </button>
                  <button type="button" className="btn btn-sm" disabled={i === shots.length - 1} onClick={() => moveShot(i, 1)} aria-label="Move right">
                    →
                  </button>
                  <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => set('screenshots')(shots.filter((_, n) => n !== i))}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card form">
        <div className="card-head" style={{ marginBottom: 0 }}>
          <h3>Product videos</h3>
          {videos.length < 2 && (
            <button type="button" className="btn btn-sm" onClick={() => set('videos')([...videos, { title: '', url: '' }])} data-testid="add-video">
              Add video
            </button>
          )}
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Up to 2 videos. Paste a YouTube or Vimeo link (or a direct .mp4 address).
        </p>
        {videos.map((v, i) => (
          <div key={i} className="grid-2" style={{ alignItems: 'end' }}>
            <Field label="Title">
              <Input value={v.title} onChange={(x) => setVideo(i, { title: x })} placeholder="DocGen in 2 minutes" maxLength={80} />
            </Field>
            <Field
              label="Video link"
              error={v.url && !embedUrl(v.url) && !/\.(mp4|webm)(\?|$)/i.test(v.url) ? 'Use a YouTube, Vimeo or .mp4 link' : null}
            >
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Input value={v.url} onChange={(x) => setVideo(i, { url: x })} placeholder="https://www.youtube.com/watch?v=…" data-testid={`video-url-${i}`} />
                <button type="button" className="btn btn-sm" onClick={() => set('videos')(videos.filter((_, n) => n !== i))}>
                  Remove
                </button>
              </div>
            </Field>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Comparison</h3>
        <Check checked={form.showComparison} onChange={set('showComparison')} label="Show the comparison with accounting software and Word/Excel templates" />
      </div>

      <div className="row end sticky-save">
        <button className="btn btn-primary" data-testid="save-site">
          Save website
        </button>
      </div>
    </form>
  );
}
