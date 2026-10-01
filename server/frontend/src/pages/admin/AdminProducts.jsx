/**
 * Products & pricing: what is sold on the website, for how much, and how long the license lasts.
 * Changes apply to new purchases and renewals immediately — no code changes needed.
 */

import { useState } from 'react';
import { adminApi, money } from '../../api.js';
import { Badge, Check, ErrorText, Field, Input, Modal, Select, Spinner, Textarea, useLoad, useToast } from '../../components/ui.jsx';
import { period } from '../portal/ProductPage.jsx';

const blank = { name: '', description: '', price: 1250, currency: 'INR', durationDays: 365, maxDevices: 1, features: [], isActive: true, isPublic: true, sortOrder: 0 };
const PERIODS = [
  { value: '365', label: '1 year' },
  { value: '730', label: '2 years' },
  { value: '1095', label: '3 years' },
  { value: '0', label: 'Lifetime' },
  { value: 'custom', label: 'Custom (days)…' },
];

function ProductForm({ product, onClose }) {
  const toast = useToast();
  const initialDays = String(product?.durationDays ?? 365);
  const [form, setForm] = useState({
    ...blank,
    ...product,
    featuresText: (product?.features || []).join('\n'),
    period: PERIODS.some((p) => p.value === initialDays) ? initialDays : 'custom',
    customDays: initialDays,
  });
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm({ ...form, [k]: v });
  const fieldError = (k) => error?.details?.fields?.[k];
  const submit = async (e) => {
    e.preventDefault();
    const body = {
      ...(product?.code ? { code: product.code } : {}),
      name: form.name,
      description: form.description,
      price: Number(form.price),
      currency: form.currency,
      durationDays: Number(form.period === 'custom' ? form.customDays : form.period),
      maxDevices: Number(form.maxDevices),
      isActive: form.isActive,
      isPublic: form.isPublic,
      sortOrder: Number(form.sortOrder),
      features: form.featuresText.split('\n').map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (product?.id) await adminApi.put(`/plans/${product.id}`, body);
      else await adminApi.post('/plans', body);
      toast('Product saved. The website shows the new details now.');
      onClose(true);
    } catch (err) {
      setError(err);
    }
  };
  return (
    <Modal title={product?.id ? `Edit ${product.name}` : 'New product'} onClose={() => onClose(false)} wide>
      <form className="form" onSubmit={submit} data-testid="product-form">
        <ErrorText error={error} />
        <div className="grid-2">
          <Field label="Product name" error={fieldError('name')}>
            <Input value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Price (₹)" hint="One-time payment, taxes included" error={fieldError('price')}>
            <Input type="number" min="0" step="1" value={form.price} onChange={set('price')} required data-testid="product-price" />
          </Field>
          <Field label="Payment type">
            <Input value="One-time payment" onChange={() => {}} disabled />
          </Field>
          <Field label="License validity" hint="Counted from the payment date. A renewal adds the same period.">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <Select value={form.period} onChange={set('period')} options={PERIODS} data-testid="product-period" />
              {form.period === 'custom' && <Input type="number" min="1" max="3650" value={form.customDays} onChange={set('customDays')} style={{ width: 110 }} aria-label="Days" />}
            </div>
          </Field>
          <Field label="Computers per license">
            <Input type="number" min="1" value={form.maxDevices} onChange={set('maxDevices')} />
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
          <Check checked={form.isPublic} onChange={set('isPublic')} label="Shown on the website" />
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
          <p className="muted">Price, license validity and computers for each product. Changes apply to new purchases and renewals at once.</p>
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
                  <th className="right">Price</th>
                  <th>Payment</th>
                  <th>License</th>
                  <th>Computers</th>
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
                    <td className="right">
                      <strong>{money(p.price, p.currency)}</strong>
                    </td>
                    <td>One-time</td>
                    <td style={{ textTransform: 'capitalize' }}>{period(p.durationDays)}</td>
                    <td>{p.maxDevices}</td>
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
