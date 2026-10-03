/** Products & Services (with categories), as on the desktop: saved once, picked quickly in documents. */

import { useCallback, useEffect, useState } from 'react';
import { SERVICE_UNITS, unitOptions } from '@desktop/config/units.js';
import { isValidRate, rateValue, taxRateOptions } from '@desktop/config/taxRates.js';
import { deleteCategory, deleteProduct, listCategories, listProducts, saveCategory, saveProduct } from '@desktop/services/catalogService.js';
import { formatMoney } from '@desktop/utils/format.js';
import Icon from '../components/Icon.jsx';
import { Empty, Field, Header, Input, NumberInput, Picker, Segmented, Select, Sheet, Spinner, TextArea, useUi } from '../components/ui.jsx';
import { useApp } from '../data.jsx';

const emptyProduct = (settings) => ({
  type: 'PRODUCT', name: '', sku: '', category_id: '', description: '', hsn_sac: '', unit: settings.units?.[0] || 'Nos', selling_price: '',
  purchase_price: '', tax_rate: settings.taxSystem === 'NONE' ? '0' : String(settings.defaultTaxRate ?? '0'), tax_type: 'EXCLUSIVE', barcode: '', notes: '',
});

function ProductSheet({ initial, categories, settings, onClose, onSaved }) {
  const { toast, confirm } = useUi();
  const [p, setP] = useState(initial);
  const [more, setMore] = useState(!!(initial.barcode || initial.notes || Number(initial.purchase_price)));
  const [saving, setSaving] = useState(false);
  const set = (patch) => setP((x) => ({ ...x, ...patch }));
  const submit = async (e) => {
    e.preventDefault();
    if (!p.name.trim()) return toast('Please enter a name.', 'bad');
    setSaving(true);
    try {
      await saveProduct({
        ...p,
        name: p.name.trim(),
        category_id: p.category_id ? Number(p.category_id) : null,
        selling_price: p.selling_price || '0',
        purchase_price: p.purchase_price || '0',
        tax_rate: p.tax_type === 'EXEMPT' ? '0' : p.tax_rate || '0',
      });
      toast(`${p.type === 'SERVICE' ? 'Service' : 'Product'} saved`);
      onSaved();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setSaving(false);
    }
    return undefined;
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete "${p.name}"?`, message: 'Existing documents keep their copy of this item. This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await deleteProduct(p.id);
      toast('Deleted');
      onSaved();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  return (
    <Sheet full title={p.id ? `Edit ${initial.name}` : 'Add product or service'} onClose={onClose} testId="product-sheet">
      <form className="form" onSubmit={submit}>
        <Segmented
          value={p.type}
          onChange={(type) => set({ type, unit: type === 'SERVICE' && !SERVICE_UNITS.includes(p.unit) ? 'Service' : type === 'PRODUCT' && SERVICE_UNITS.includes(p.unit) ? 'Nos' : p.unit })}
          options={[
            { value: 'PRODUCT', label: 'Product' },
            { value: 'SERVICE', label: 'Service' },
          ]}
          testId="product-type"
        />
        <Field label="Name" required>
          <Input value={p.name} onChange={(v) => set({ name: v })} data-testid="product-name" />
        </Field>
        <div className="grid-2">
          <Field label="SKU / Code">
            <Input value={p.sku} onChange={(v) => set({ sku: v })} />
          </Field>
          <Field label="Unit">
            <Picker value={p.unit} onChange={(v) => set({ unit: v || '' })} options={unitOptions(settings.units || [], p.type === 'SERVICE' ? 'service' : 'product')} title="Unit" creatable testId="product-unit" />
          </Field>
        </div>
        <Field label="Category">
          <Picker value={p.category_id ? String(p.category_id) : ''} onChange={(v) => set({ category_id: v })} options={[{ value: '', label: '— None —' }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]} placeholder="— None —" title="Category" testId="product-category" />
        </Field>
        <div className="grid-2">
          <Field label={p.type === 'SERVICE' ? 'SAC code' : 'HSN code'}>
            <Input value={p.hsn_sac} onChange={(v) => set({ hsn_sac: v.replace(/[^0-9]/g, '').slice(0, 8) })} inputMode="numeric" data-testid="product-hsn" />
          </Field>
          {settings.taxSystem !== 'NONE' && (
            <Field label={settings.taxSystem === 'GST' ? 'GST' : `${settings.taxLabel || 'Tax'} rate`}>
              <Picker
                value={p.tax_type === 'EXEMPT' ? '0' : rateValue(p.tax_rate)}
                onChange={(v) => v !== '' && isValidRate(v) && set({ tax_rate: v })}
                options={taxRateOptions(settings, p.tax_rate)}
                creatable
                disabled={p.tax_type === 'EXEMPT'}
                title="GST rate"
                testId="product-gst"
              />
            </Field>
          )}
        </div>
        <Field label="Description">
          <TextArea rows={2} value={p.description} onChange={(v) => set({ description: v })} />
        </Field>
        <div className="grid-2">
          <Field label="Selling price">
            <NumberInput value={p.selling_price} onChange={(v) => set({ selling_price: v })} placeholder="0.00" data-testid="product-price" />
          </Field>
          {settings.taxSystem !== 'NONE' && (
            <Field label="Price is">
              <Select
                value={p.tax_type}
                onChange={(v) => set({ tax_type: v })}
                options={[
                  { value: 'EXCLUSIVE', label: 'Excluding tax' },
                  { value: 'INCLUSIVE', label: 'Including tax' },
                  { value: 'EXEMPT', label: 'Exempt / nil rated' },
                ]}
                data-testid="product-tax-type"
              />
            </Field>
          )}
        </div>
        {more ? (
          <>
            <div className="grid-2">
              <Field label="Purchase price">
                <NumberInput value={p.purchase_price} onChange={(v) => set({ purchase_price: v })} placeholder="0.00" data-testid="product-purchase-price" />
              </Field>
              <Field label="Barcode">
                <Input value={p.barcode} onChange={(v) => set({ barcode: v })} inputMode="numeric" />
              </Field>
            </div>
            <Field label="Notes">
              <TextArea rows={2} value={p.notes} onChange={(v) => set({ notes: v })} />
            </Field>
          </>
        ) : (
          <button type="button" className="btn btn-sm btn-ghost align-start" onClick={() => setMore(true)} data-testid="product-more">
            + Purchase price, barcode &amp; notes
          </button>
        )}
        <button className="btn btn-primary btn-block" disabled={saving} data-testid="product-save">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {p.id && (
          <button type="button" className="btn btn-danger btn-block" onClick={remove} data-testid="product-delete">
            <Icon name="trash" size={18} /> Delete
          </button>
        )}
      </form>
    </Sheet>
  );
}

function CategoriesSheet({ categories, onClose, onChanged }) {
  const { toast, confirm } = useUi();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await saveCategory({ name: name.trim() });
      setName('');
      onChanged();
    } catch (err) {
      toast(err.message, 'bad');
    }
  };
  const rename = async () => {
    try {
      await saveCategory({ id: editing.id, name: editing.name.trim() });
      setEditing(null);
      onChanged();
    } catch (err) {
      toast(err.message, 'bad');
    }
  };
  const remove = async (c) => {
    const ok = await confirm({
      title: `Delete category "${c.name}"?`,
      message: c.product_count ? `${c.product_count} product(s) will stay but will have no category.` : 'This category is not used by any product.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await deleteCategory(c.id);
    onChanged();
  };
  return (
    <Sheet title="Categories" onClose={onClose} testId="categories">
      <form className="row" onSubmit={add}>
        <input className="input" placeholder="New category, e.g. Furniture" value={name} onChange={(e) => setName(e.target.value)} data-testid="category-name" />
        <button className="btn btn-primary" data-testid="category-add">
          Add
        </button>
      </form>
      <div className="list">
        {categories.map((c) => (
          <div key={c.id} className="list-item static">
            {editing?.id === c.id ? (
              <>
                <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
                <button className="btn btn-sm btn-primary" onClick={rename}>
                  Save
                </button>
              </>
            ) : (
              <>
                <span className="list-main">
                  <strong>{c.name}</strong>
                  <span className="small muted">{c.product_count} items</span>
                </span>
                <button className="icon-btn sm" onClick={() => setEditing({ id: c.id, name: c.name })} aria-label="Rename">
                  <Icon name="edit" size={18} />
                </button>
                <button className="icon-btn sm danger" onClick={() => remove(c)} aria-label="Delete">
                  <Icon name="trash" size={18} />
                </button>
              </>
            )}
          </div>
        ))}
        {categories.length === 0 && <p className="muted small center">No categories yet.</p>}
      </div>
    </Sheet>
  );
}

export default function Products() {
  const { settings } = useApp();
  const { toast } = useUi();
  const [rows, setRows] = useState(null);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState(null);
  const [showCategories, setShowCategories] = useState(false);

  const load = useCallback(async () => {
    try {
      const [products, cats] = await Promise.all([listProducts({ search, type: kind, category_id: category ? Number(category) : null }), listCategories()]);
      setRows(products);
      setCategories(cats);
    } catch (e) {
      toast(e.message, 'bad');
    }
  }, [search, kind, category, toast]);
  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load]);

  const edit = (p) => setEditing({ ...emptyProduct(settings), ...p, category_id: p.category_id ? String(p.category_id) : '' });

  return (
    <>
      <Header
        title="Products & Services"
        actions={
          <button className="btn btn-sm" onClick={() => setShowCategories(true)} data-testid="open-categories">
            <Icon name="tag" size={16} /> Categories
          </button>
        }
      />
      <div className="page" data-testid="products">
        <div className="search">
          <Icon name="search" size={18} />
          <input className="input" placeholder="Name, SKU, HSN or category" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="product-search" />
        </div>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: '', label: 'All' },
            { value: 'PRODUCT', label: 'Products' },
            { value: 'SERVICE', label: 'Services' },
          ]}
          testId="product-kind"
        />
        {categories.length > 0 && (
          <Picker value={category} onChange={(v) => setCategory(v || '')} options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]} placeholder="All categories" title="Category" testId="category-filter" />
        )}
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty
            icon="box"
            title={search || kind || category ? 'Nothing found' : 'No products or services yet'}
            message="Add the items you sell or buy often. You can also save items directly from a document."
          />
        ) : (
          <div className="list" data-testid="product-list">
            {rows.map((p) => (
              <button key={p.id} className="list-item" onClick={() => edit(p)} data-testid="product-row">
                <span className="avatar">
                  <Icon name={p.type === 'SERVICE' ? 'tool' : 'box'} size={19} />
                </span>
                <span className="list-main">
                  <strong>
                    {p.name}
                    {p.is_demo ? <span className="pill demo">Sample</span> : null}
                  </strong>
                  <span className="small muted">{[p.type === 'SERVICE' ? 'Service' : 'Product', p.category_name, p.hsn_sac && `HSN ${p.hsn_sac}`, p.unit].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="list-end">
                  <strong className="amount">{formatMoney(p.selling_price, { currency: settings.baseCurrency, currency_symbol: '' })}</strong>
                  <span className="small muted">{p.tax_type === 'EXEMPT' ? 'Exempt' : `${p.tax_rate}%${p.tax_type === 'INCLUSIVE' ? ' incl.' : ''}`}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="fab no-print" onClick={() => setEditing(emptyProduct(settings))} aria-label="Add product or service" data-testid="add-product">
        <Icon name="plus" size={26} />
      </button>
      {editing && (
        <ProductSheet
          initial={editing}
          categories={categories}
          settings={settings}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {showCategories && <CategoriesSheet categories={categories} onClose={() => setShowCategories(false)} onChanged={load} />}
    </>
  );
}
