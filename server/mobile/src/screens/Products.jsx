/** Products & Services: saved items with HSN/SAC, unit, price and GST rate (picked in the editor). */

import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Field, Header, Input, Select, Sheet, useUi } from '../components/ui.jsx';
import { all, del, put } from '../lib/db.js';
import { money } from '../lib/docs.js';
import { DEFAULT_UNITS, SERVICE_UNITS } from '../lib/units.js';

const GST = ['0', '3', '5', '12', '18', '28'];
const blank = { name: '', kind: 'product', hsn: '', unit: 'Nos', rate: '', taxRate: '18' };

function ProductSheet({ product, onClose, onSaved }) {
  const { toast, confirm } = useUi();
  const [form, setForm] = useState({ ...blank, ...product });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v, ...(k === 'kind' ? { unit: v === 'service' ? 'Service' : 'Nos' } : {}) }));
  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const now = new Date().toISOString();
    await put('products', { ...form, name: form.name.trim(), nameLower: form.name.trim().toLowerCase(), updatedAt: now, createdAt: form.createdAt || now });
    toast('Saved');
    onSaved();
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete ${form.name}?`, confirmLabel: 'Delete', danger: true }))) return;
    await del('products', form.id);
    onSaved();
  };
  return (
    <Sheet title={product?.id ? 'Edit item' : 'New product or service'} onClose={onClose}>
      <form className="form" onSubmit={save} data-testid="product-form">
        <div className="segmented">
          <button type="button" className={form.kind !== 'service' ? 'active' : ''} onClick={() => set('kind')('product')}>
            Product
          </button>
          <button type="button" className={form.kind === 'service' ? 'active' : ''} onClick={() => set('kind')('service')}>
            Service
          </button>
        </div>
        <Field label="Name">
          <Input value={form.name} onChange={set('name')} required data-testid="product-name" />
        </Field>
        <div className="grid-2">
          <Field label={form.kind === 'service' ? 'SAC' : 'HSN'}>
            <Input value={form.hsn} onChange={set('hsn')} inputMode="numeric" />
          </Field>
          <Field label="Unit">
            <Select value={form.unit} onChange={set('unit')} options={form.kind === 'service' ? [...SERVICE_UNITS, ...DEFAULT_UNITS.filter((u) => !SERVICE_UNITS.includes(u))] : DEFAULT_UNITS} />
          </Field>
          <Field label="Price (₹)">
            <Input type="number" inputMode="decimal" value={form.rate} onChange={set('rate')} data-testid="product-rate" />
          </Field>
          <Field label="GST %">
            <Select value={form.taxRate} onChange={set('taxRate')} options={GST.map((g) => ({ value: g, label: `${g}%` }))} />
          </Field>
        </div>
        <button className="btn btn-primary btn-block" data-testid="product-save">
          Save
        </button>
        {product?.id && (
          <button type="button" className="btn btn-danger btn-block" onClick={remove}>
            Delete
          </button>
        )}
      </form>
    </Sheet>
  );
}

export default function Products() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const load = () => all('products').then(setRows);
  useEffect(() => {
    load();
  }, []);
  const list = useMemo(() => (rows || []).filter((p) => !q.trim() || p.nameLower.includes(q.trim().toLowerCase())).sort((a, b) => a.nameLower.localeCompare(b.nameLower)), [rows, q]);
  return (
    <>
      <Header title="Products & Services" />
      <div className="page" data-testid="products">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search products" />
        {!rows ? null : !list.length ? (
          <div className="card empty">
            <div className="icon-wrap">
              <Icon name="box" size={28} />
            </div>
            <strong>{rows.length ? 'Nothing found' : 'No products yet'}</strong>
            <p className="small">Add the items you sell. They are also saved automatically from your invoices.</p>
          </div>
        ) : (
          <div className="list" data-testid="product-list">
            {list.map((p) => (
              <button key={p.id} className="list-item" onClick={() => setEditing(p)}>
                <span className="avatar">{p.name.charAt(0).toUpperCase()}</span>
                <span className="list-main">
                  <strong>{p.name}</strong>
                  <span className="small muted">
                    {[p.hsn && `HSN ${p.hsn}`, p.unit, `GST ${p.taxRate || 0}%`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="list-end">{p.rate ? <strong>{money(p.rate)}</strong> : null}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="fab" onClick={() => setEditing({})} aria-label="Add product" data-testid="fab">
        <Icon name="plus" size={26} strokeWidth={2.4} />
      </button>
      {editing && (
        <ProductSheet
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}
