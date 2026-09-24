import { useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import { EmptyState, PageHeader, Spinner } from '../../components/Common.jsx';
import { Field, NumberInput, Segmented, Select, TextArea, TextInput } from '../../components/Form.jsx';
import {
  deleteCategory,
  deleteProduct,
  listCategories,
  listProducts,
  saveCategory,
  saveProduct,
} from '../../services/catalogService.js';
import { formatMoney } from '../../utils/format.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useConfirm, useToast } from '../../hooks/useUi.jsx';
import { useDebounced } from '../../hooks/useShortcuts.js';

const emptyProduct = (settings) => ({
  type: 'PRODUCT',
  name: '',
  sku: '',
  category_id: '',
  description: '',
  hsn_sac: '',
  unit: settings.units?.[0] || 'Nos',
  selling_price: '',
  purchase_price: '',
  tax_rate: settings.taxSystem === 'NONE' ? '0' : String(settings.defaultTaxRate ?? '0'),
  tax_type: 'EXCLUSIVE',
  barcode: '',
  notes: '',
});

function ProductForm({ initial, categories, settings, onClose, onSaved }) {
  const toast = useToast();
  const [p, setP] = useState(initial);
  const [more, setMore] = useState(!!(initial.barcode || initial.notes || initial.purchase_price));
  const [saving, setSaving] = useState(false);
  const set = (patch) => setP((x) => ({ ...x, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    if (!p.name.trim()) return toast.error('Please enter a name.');
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
      toast.success(`${p.type === 'SERVICE' ? 'Service' : 'Product'} saved`);
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <Modal title={p.id ? `Edit ${p.name}` : 'Add product or service'} onClose={onClose} size="lg">
      <form onSubmit={submit} className="form">
        <Segmented
          value={p.type}
          onChange={(type) => set({ type, unit: type === 'SERVICE' && p.unit === 'Nos' ? 'Job' : p.unit })}
          options={[
            { value: 'PRODUCT', label: 'Product' },
            { value: 'SERVICE', label: 'Service' },
          ]}
        />
        <div className="grid-2">
          <Field label="Name" required>
            <TextInput value={p.name} onChange={(v) => set({ name: v })} autoFocus data-testid="product-name" />
          </Field>
          <Field label="SKU / Code">
            <TextInput value={p.sku} onChange={(v) => set({ sku: v })} />
          </Field>
          <Field label="Category">
            <Select
              value={p.category_id ?? ''}
              onChange={(v) => set({ category_id: v })}
              options={[{ value: '', label: '— None —' }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))]}
            />
          </Field>
          <Field label={p.type === 'SERVICE' ? 'SAC code' : 'HSN code'}>
            <TextInput value={p.hsn_sac} onChange={(v) => set({ hsn_sac: v })} />
          </Field>
          <Field label="Description" className="span-2">
            <TextArea rows={2} value={p.description} onChange={(v) => set({ description: v })} />
          </Field>
          <Field label="Unit">
            <TextInput value={p.unit} onChange={(v) => set({ unit: v })} list="product-units" />
          </Field>
          <Field label="Selling price">
            <NumberInput value={p.selling_price} onChange={(v) => set({ selling_price: v })} placeholder="0.00" data-testid="product-price" />
          </Field>
          {settings.taxSystem !== 'NONE' && (
            <>
              <Field label={`${settings.taxSystem === 'GST' ? 'GST' : settings.taxLabel || 'Tax'} rate %`}>
                <input
                  className="input num"
                  list="product-tax-rates"
                  value={p.tax_type === 'EXEMPT' ? '0' : p.tax_rate}
                  disabled={p.tax_type === 'EXEMPT'}
                  onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && set({ tax_rate: e.target.value })}
                />
              </Field>
              <Field label="Tax type">
                <Select
                  value={p.tax_type}
                  onChange={(v) => set({ tax_type: v })}
                  options={[
                    { value: 'EXCLUSIVE', label: 'Price excludes tax (tax added on top)' },
                    { value: 'INCLUSIVE', label: 'Price includes tax' },
                    { value: 'EXEMPT', label: 'Exempt / nil rated' },
                  ]}
                />
              </Field>
            </>
          )}
        </div>
        <datalist id="product-units">
          {(settings.units || []).map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <datalist id="product-tax-rates">
          {(settings.taxRates || []).map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>

        {more ? (
          <div className="grid-2">
            <Field label="Purchase price">
              <NumberInput value={p.purchase_price} onChange={(v) => set({ purchase_price: v })} placeholder="0.00" />
            </Field>
            <Field label="Barcode">
              <TextInput value={p.barcode} onChange={(v) => set({ barcode: v })} />
            </Field>
            <Field label="Notes" className="span-2">
              <TextArea rows={2} value={p.notes} onChange={(v) => set({ notes: v })} />
            </Field>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMore(true)}>
            + Purchase price, barcode &amp; notes
          </button>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving} data-testid="product-save">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CategoriesModal({ categories, onClose, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
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
      toast.error(err.message);
    }
  };
  const rename = async () => {
    try {
      await saveCategory({ id: editing.id, name: editing.name.trim() });
      setEditing(null);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const remove = async (c) => {
    const ok = await confirm({
      title: `Delete category "${c.name}"?`,
      message: c.product_count ? `${c.product_count} product(s) will stay but will have no category.` : 'This category is not used by any product.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCategory(c.id);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Modal title="Categories" onClose={onClose}>
      <form onSubmit={add} className="inline-form">
        <input className="input" placeholder="New category, e.g. Furniture" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" type="submit">
          <Icon name="plus" /> Add
        </button>
      </form>
      <ul className="simple-list">
        {categories.map((c) => (
          <li key={c.id}>
            {editing?.id === c.id ? (
              <>
                <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
                <button className="btn btn-sm btn-primary" onClick={rename}>
                  Save
                </button>
              </>
            ) : (
              <>
                <span>
                  {c.name} <small className="muted">({c.product_count})</small>
                </span>
                <span className="row-actions">
                  <button className="icon-btn" title="Rename" onClick={() => setEditing({ id: c.id, name: c.name })}>
                    <Icon name="edit" size={16} />
                  </button>
                  <button className="icon-btn danger" title="Delete" onClick={() => remove(c)}>
                    <Icon name="trash" size={16} />
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
        {categories.length === 0 && <li className="muted">No categories yet.</li>}
      </ul>
    </Modal>
  );
}

export default function ProductsPage() {
  const { settings } = useAppData();
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState(null);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState(null);
  const [showCategories, setShowCategories] = useState(false);
  const debounced = useDebounced(search, 200);

  const load = useCallback(async () => {
    try {
      const [products, cats] = await Promise.all([
        listProducts({ search: debounced, type: kind, category_id: category ? Number(category) : null }),
        listCategories(),
      ]);
      setRows(products);
      setCategories(cats);
    } catch (e) {
      toast.error(e.message);
    }
  }, [debounced, kind, category, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (p) => {
    const ok = await confirm({
      title: `Delete "${p.name}"?`,
      message: 'Existing documents keep their copy of this item. This cannot be undone.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteProduct(p.id);
      toast.success('Deleted');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Products & Services"
        subtitle="Save items once and pick them quickly while creating documents"
        actions={
          <>
            <button className="btn" onClick={() => setShowCategories(true)}>
              <Icon name="tag" /> Categories
            </button>
            <button className="btn btn-primary" onClick={() => setEditing(emptyProduct(settings))} data-testid="add-product">
              <Icon name="plus" /> Add New
            </button>
          </>
        }
      />
      <div className="toolbar card">
        <div className="search">
          <Icon name="search" />
          <input className="input" placeholder="Search name, SKU, HSN or category…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: '', label: 'All' },
            { value: 'PRODUCT', label: 'Products' },
            { value: 'SERVICE', label: 'Services' },
          ]}
        />
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card table-card">
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="box"
            title={search || kind || category ? 'Nothing found' : 'No products or services yet'}
            message="Add the items you sell or buy often. You can also save items directly from a document."
            action={
              <button className="btn btn-primary" onClick={() => setEditing(emptyProduct(settings))}>
                <Icon name="plus" /> Add product or service
              </button>
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Category</th>
                <th>HSN/SAC</th>
                <th>Unit</th>
                <th className="num">Selling price</th>
                <th className="num">Tax</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} onDoubleClick={() => setEditing({ ...emptyProduct(settings), ...p, category_id: p.category_id ? String(p.category_id) : '' })}>
                  <td>
                    <strong>{p.name}</strong>
                    {p.is_demo ? <span className="badge badge-demo">Sample</span> : null}
                    {p.sku && <div className="muted small">{p.sku}</div>}
                  </td>
                  <td>{p.type === 'SERVICE' ? 'Service' : 'Product'}</td>
                  <td>{p.category_name || '—'}</td>
                  <td>{p.hsn_sac || '—'}</td>
                  <td>{p.unit}</td>
                  <td className="num">
                    {formatMoney(p.selling_price, { currency: settings.baseCurrency, currency_symbol: '' })}
                    {p.tax_type === 'INCLUSIVE' && <div className="muted small">incl. tax</div>}
                  </td>
                  <td className="num">{p.tax_type === 'EXEMPT' ? 'Exempt' : `${p.tax_rate}%`}</td>
                  <td className="actions-col">
                    <div className="row-actions">
                      <button
                        className="icon-btn"
                        title="Edit"
                        onClick={() => setEditing({ ...emptyProduct(settings), ...p, category_id: p.category_id ? String(p.category_id) : '' })}
                      >
                        <Icon name="edit" size={17} />
                      </button>
                      <button className="icon-btn danger" title="Delete" onClick={() => remove(p)}>
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <ProductForm
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
      {showCategories && <CategoriesModal categories={categories} onClose={() => setShowCategories(false)} onChanged={load} />}
    </div>
  );
}
