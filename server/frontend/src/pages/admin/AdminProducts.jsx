/**
 * Products & pricing: what is sold on the website, for how much, and how long the license lasts.
 * Changes apply to new purchases and renewals immediately — no code changes needed.
 */

import { useState } from 'react';
import { adminApi, money } from '../../api.js';
import { Badge, Check, ErrorText, Field, Input, Modal, Select, Spinner, Textarea, useLoad, useToast } from '../../components/ui.jsx';

const blank = {
  name: '', description: '', currency: 'INR', maxDevices: 1, maxMobileDevices: 2, features: [], isActive: true, isPublic: true, sortOrder: 0,
  prices: [{ durationDays: 365, price: 1250, label: '' }],
};
const PRESETS = [
  { value: '30', label: '1 month' },
  { value: '90', label: '3 months' },
  { value: '180', label: '6 months' },
  { value: '365', label: '1 year' },
  { value: '730', label: '2 years' },
  { value: '1095', label: '3 years' },
  { value: '1825', label: '5 years' },
  { value: '0', label: 'Lifetime' },
  { value: 'custom', label: 'Custom (days)…' },
];
const presetOf = (days) => (PRESETS.some((p) => p.value === String(days)) ? String(days) : 'custom');

/** One row per license duration: duration, price, optional label. */
function PriceRows({ rows, onChange }) {
  const set = (i, patch) => onChange(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  return (
    <div className="price-rows" data-testid="price-rows">
      <div className="price-row price-row-head">
        <span>Duration</span>
        <span>Price (₹)</span>
        <span>Plan name (optional)</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <div key={r.key} className="price-row">
          <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
            <Select
              value={r.preset}
              onChange={(v) => set(i, { preset: v, durationDays: v === 'custom' ? r.durationDays || 365 : Number(v) })}
              options={PRESETS}
              aria-label="Duration"
              data-testid={`price-duration-${i}`}
            />
            {r.preset === 'custom' && (
              <Input type="number" min="1" max="36500" required value={r.durationDays} onChange={(v) => set(i, { durationDays: v })} aria-label="Days" placeholder="days" style={{ width: 90 }} />
            )}
          </div>
          <Input type="number" min="0" step="1" value={r.price} onChange={(v) => set(i, { price: v })} aria-label="Price" required data-testid={`price-amount-${i}`} />
          <Input value={r.label} onChange={(v) => set(i, { label: v })} placeholder="e.g. Premium" maxLength={40} aria-label="Plan name" />
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(rows.filter((_, n) => n !== i))} disabled={rows.length === 1} aria-label="Remove price">
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => {
          // Start with the next duration not used yet (never an empty one, which used to save as Lifetime).
          const used = new Set(rows.map((r) => String(r.durationDays)));
          const next = PRESETS.find((p) => p.value !== 'custom' && p.value !== '0' && !used.has(p.value) && Number(p.value) > Math.max(0, ...rows.map((r) => Number(r.durationDays) || 0)))
            || PRESETS.find((p) => p.value !== 'custom' && p.value !== '0' && !used.has(p.value));
          onChange([...rows, { key: Math.random(), preset: next ? next.value : 'custom', durationDays: next ? Number(next.value) : 365, price: '', label: '' }]);
        }}
        disabled={rows.length >= 12}
        data-testid="add-price"
      >
        Add duration
      </button>
    </div>
  );
}

function ProductForm({ product, onClose }) {
  const toast = useToast();
  const source = { ...blank, ...product };
  const [form, setForm] = useState({
    ...source,
    featuresText: (source.features || []).join('\n'),
    prices: (source.prices?.length ? source.prices : blank.prices).map((p) => ({
      key: Math.random(),
      id: p.id ?? null,
      preset: presetOf(p.durationDays),
      durationDays: p.durationDays,
      price: p.price,
      label: p.label && p.label !== durationLabelFor(p.durationDays) ? p.label : '',
    })),
  });
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm({ ...form, [k]: v });
  const fieldError = (k) => error?.details?.fields?.[k];
  const submit = async (e) => {
    e.preventDefault();
    const bad = form.prices.find((p) => p.preset === 'custom' && !(Number(p.durationDays) >= 1));
    if (bad) return setError({ message: 'Enter the number of days for each custom duration (choose “Lifetime” for a license without an end date).' });
    const body = {
      ...(product?.code ? { code: product.code } : {}),
      name: form.name,
      description: form.description,
      currency: form.currency,
      prices: form.prices.map((p) => ({ id: p.id || undefined, durationDays: Number(p.durationDays), price: Number(p.price), label: p.label })),
      maxDevices: Number(form.maxDevices),
      maxMobileDevices: Number(form.maxMobileDevices),
      isActive: form.isActive,
      isPublic: form.isPublic,
      sortOrder: Number(form.sortOrder),
      features: form.featuresText.split('\n').map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (product?.id) await adminApi.put(`/plans/${product.id}`, body);
      else await adminApi.post('/plans', body);
      toast('Product saved. The website and client panel show the new prices now.');
      onClose(true);
    } catch (err) {
      setError(err);
    }
    return undefined;
  };
  return (
    <Modal title={product?.id ? `Edit ${product.name}` : 'New product'} onClose={() => onClose(false)} wide>
      <form className="form" onSubmit={submit} data-testid="product-form">
        <ErrorText error={error} />
        <div className="grid-2">
          <Field label="Product name" error={fieldError('name')}>
            <Input value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Payment type">
            <Input value="One-time payment per license period" onChange={() => {}} disabled />
          </Field>
        </div>
        <Field
          label="Prices per license duration"
          hint="Each duration is its own pricing card on the website, with its own price. Plan name: shown on the card (e.g. Premium); empty = automatic (Standard, Plus, Premium). The lowest price per year is marked Best value."
          error={fieldError('prices') || Object.entries(error?.details?.fields || {}).find(([k]) => k.startsWith('prices.'))?.[1]}
        >
          <PriceRows rows={form.prices} onChange={set('prices')} />
        </Field>
        <div className="grid-3">
          <Field label="Computers per license">
            <Input type="number" min="1" value={form.maxDevices} onChange={set('maxDevices')} />
          </Field>
          <Field label="Phones per license (DocGen Mobile)" hint="0 = mobile app not included">
            <Input type="number" min="0" max="100" value={form.maxMobileDevices} onChange={set('maxMobileDevices')} data-testid="product-mobile-devices" />
          </Field>
          <Field label="Order on the website" hint="Lowest first">
            <Input type="number" min="0" value={form.sortOrder} onChange={set('sortOrder')} />
          </Field>
          <Field label="Short description" span>
            <Input value={form.description} onChange={set('description')} maxLength={500} />
          </Field>
          <Field label="What's included (one per line)" span>
            <Textarea rows={4} value={form.featuresText} onChange={set('featuresText')} />
          </Field>
        </div>
        <div className="row" style={{ gap: 20 }}>
          <Check checked={form.isActive} onChange={set('isActive')} label="On sale" />
          <Check checked={form.isPublic} onChange={set('isPublic')} label="Shown on the website and in the client panel" />
        </div>
        <div className="row end">
          <button type="button" className="btn" onClick={() => onClose(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" data-testid="save-product">
            Save product
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Same wording as the server ("1 year", "2 years", "Lifetime"). */
function durationLabelFor(days) {
  if (!days) return 'Lifetime';
  if (days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`;
  if (days % 30 === 0 && days < 365) return days === 30 ? '1 month' : `${days / 30} months`;
  return `${days} days`;
}

export default function AdminProducts() {
  const { data, loading, error, reload } = useLoad(() => adminApi.get('/plans'), []);
  const [editing, setEditing] = useState(null);
  const products = data?.plans || [];
  const live = products.filter((p) => p.isActive && p.isPublic);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Products &amp; pricing</h1>
          <p className="muted">Prices per license duration, and how many computers and phones a license covers. Changes apply to new purchases and extensions at once.</p>
        </div>
        <button className="btn" onClick={() => setEditing({})}>
          New product
        </button>
      </div>
      <ErrorText error={error} />
      {loading ? (
        <Spinner />
      ) : (
        <>
          {live.length === 0 && <div className="alert alert-warn">No product is on sale and shown on the website, so nobody can buy DocGen right now.</div>}
          <div className="card table-card">
            <table className="table" data-testid="products">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Prices</th>
                  <th>Computers</th>
                  <th>Phones</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} style={p.isActive ? undefined : { opacity: 0.6 }}>
                    <td>
                      <strong>{p.name}</strong>
                      <div className="muted small">{p.description}</div>
                    </td>
                    <td>
                      {p.prices.map((pr) => (
                        <div key={pr.id ?? pr.durationDays} className="nowrap">
                          {pr.label}: <strong>{money(pr.price, p.currency)}</strong>
                        </div>
                      ))}
                    </td>
                    <td>{p.maxDevices}</td>
                    <td>{p.maxMobileDevices}</td>
                    <td>
                      {!p.isActive ? <Badge status="inactive">not on sale</Badge> : p.isPublic ? <Badge status="active">on website</Badge> : <Badge status="unused">hidden</Badge>}
                    </td>
                    <td className="right">
                      <button className="btn btn-sm" onClick={() => setEditing(p)} data-testid={`edit-product-${p.code}`}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {editing && (
        <ProductForm
          product={editing}
          onClose={(changed) => {
            setEditing(null);
            if (changed) reload();
          }}
        />
      )}
    </>
  );
}
