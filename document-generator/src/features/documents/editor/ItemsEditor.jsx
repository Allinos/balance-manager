import Autocomplete from '../../../components/Autocomplete.jsx';
import Icon from '../../../components/Icon.jsx';
import { NumberInput } from '../../../components/Form.jsx';
import { listProducts, saveProduct } from '../../../services/catalogService.js';
import { blankItem } from '../../../services/documentService.js';
import { exclusivePrice } from '../../../utils/calc.js';
import { formatMoney } from '../../../utils/format.js';
import { dec } from '../../../utils/decimal.js';
import { useToast } from '../../../hooks/useUi.jsx';

/**
 * Item rows. Typing in the item name searches Products & Services; choosing one
 * fills HSN, unit, price and tax. Unknown items can be saved as products inline.
 */
export default function ItemsEditor({ items, lines, doc, ds, settings, onChange }) {
  const toast = useToast();
  const showPrices = ds.showPrices !== false;
  const showTax = showPrices && ds.showTax !== false && doc.tax_mode !== 'NONE';
  const purchase = ['PURCHASE_ORDER', 'GOODS_RECEIPT'].includes(doc.document_type);
  const lineByKey = Object.fromEntries(lines.map((l) => [l._key, l]));

  const update = (key, patch) => onChange(items.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  const remove = (key) => {
    const next = items.filter((it) => it._key !== key);
    onChange(next.length ? next : [blankItem(settings)]);
  };
  const add = () => onChange([...items, blankItem(settings)]);

  const pickProduct = (key, p) => {
    const rate = p.tax_type === 'EXEMPT' ? '0' : p.tax_rate;
    const basePrice = purchase && dec(p.purchase_price) > 0n ? p.purchase_price : p.selling_price;
    const price = p.tax_type === 'INCLUSIVE' ? exclusivePrice(basePrice, rate) : basePrice;
    update(key, {
      product_id: p.id,
      name: p.name,
      description: p.description,
      hsn_sac: p.hsn_sac,
      unit: p.unit,
      unit_price: price,
      tax_rate: settings.taxSystem === 'NONE' ? '0' : rate,
    });
  };

  const saveAsProduct = async (it) => {
    try {
      const id = await saveProduct({
        type: it.hsn_sac?.startsWith('99') || ['Hrs', 'Days', 'Job', 'Month'].includes(it.unit) ? 'SERVICE' : 'PRODUCT',
        name: it.name.trim(),
        description: it.description,
        hsn_sac: it.hsn_sac,
        unit: it.unit,
        selling_price: purchase ? '0' : it.unit_price,
        purchase_price: purchase ? it.unit_price : '0',
        tax_rate: it.tax_rate,
        tax_type: 'EXCLUSIVE',
      });
      update(it._key, { product_id: id });
      toast.success(`"${it.name.trim()}" saved to Products & Services`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const cols = [
    'item',
    ds.showHsn !== false && 'hsn',
    'qty',
    'unit',
    ds.showPackage && 'pkg',
    showPrices && 'rate',
    showPrices && 'disc',
    showTax && 'tax',
    showPrices && 'amount',
    'remove',
  ].filter(Boolean);
  const WIDTHS = { item: 'minmax(180px, 3fr)', hsn: '88px', qty: '72px', unit: '72px', pkg: '130px', rate: '104px', disc: '104px', tax: '72px', amount: '112px', remove: '64px' };
  const gridStyle = { gridTemplateColumns: cols.map((c) => WIDTHS[c]).join(' ') };

  return (
    <section className="card editor-section">
      <div className="card-header">
        <h2>Items</h2>
        <span className="muted small">Tip: start typing to pick a saved product or service</span>
      </div>
      <div className="items-grid" role="table" aria-label="Items">
        <div className="items-head" role="row" style={gridStyle}>
          <span className="c-item">Product / Service</span>
          {cols.includes('hsn') && <span>HSN/SAC</span>}
          <span className="num">Qty</span>
          <span>Unit</span>
          {cols.includes('pkg') && <span>Package</span>}
          {cols.includes('rate') && <span className="num">Rate</span>}
          {cols.includes('disc') && <span className="num">Discount</span>}
          {cols.includes('tax') && <span className="num">{doc.tax_label || 'Tax'} %</span>}
          {cols.includes('amount') && <span className="num">Amount</span>}
          <span />
        </div>
        {items.map((it, index) => {
          const line = lineByKey[it._key];
          return (
            <div className="items-row" role="row" key={it._key} style={gridStyle}>
              <div className="c-item">
                <Autocomplete
                  value={it.name}
                  onChange={(v) => update(it._key, { name: v, product_id: it.name === v ? it.product_id : null })}
                  fetchOptions={(q) => listProducts({ search: q, limit: 8 })}
                  onSelect={(p) => pickProduct(it._key, p)}
                  placeholder={`Item ${index + 1} — name`}
                  renderOption={(p) => (
                    <div className="ac-option">
                      <strong>{p.name}</strong>
                      <small>
                        {[p.sku, p.hsn_sac && `HSN ${p.hsn_sac}`, formatMoney(purchase ? p.purchase_price : p.selling_price, { currency_symbol: doc.currency_symbol, currency: doc.currency }), `${p.tax_rate}%`]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </div>
                  )}
                  inputProps={{ 'data-testid': `item-name-${index}` }}
                />
                <input
                  className="input input-desc"
                  placeholder="Description (optional)"
                  value={it.description}
                  onChange={(e) => update(it._key, { description: e.target.value })}
                />
              </div>
              {cols.includes('hsn') && (
                <input className="input" value={it.hsn_sac} onChange={(e) => update(it._key, { hsn_sac: e.target.value })} aria-label="HSN/SAC" />
              )}
              <NumberInput value={it.quantity} onChange={(v) => update(it._key, { quantity: v })} aria-label="Quantity" data-testid={`item-qty-${index}`} />
              <input className="input" list="unit-list" value={it.unit} onChange={(e) => update(it._key, { unit: e.target.value })} aria-label="Unit" />
              {cols.includes('pkg') && (
                <input
                  className="input"
                  placeholder="e.g. 2 boxes"
                  value={it.package_info}
                  onChange={(e) => update(it._key, { package_info: e.target.value })}
                  aria-label="Package information"
                />
              )}
              {cols.includes('rate') && (
                <NumberInput value={it.unit_price} onChange={(v) => update(it._key, { unit_price: v })} aria-label="Unit price" data-testid={`item-rate-${index}`} />
              )}
              {cols.includes('disc') && (
                <div className="disc-input">
                  <NumberInput value={it.discount_value} onChange={(v) => update(it._key, { discount_value: v })} aria-label="Discount" />
                  <button
                    type="button"
                    className="disc-type"
                    title="Switch between percent and amount"
                    onClick={() => update(it._key, { discount_type: it.discount_type === 'PERCENT' ? 'AMOUNT' : 'PERCENT' })}
                  >
                    {it.discount_type === 'PERCENT' ? '%' : doc.currency_symbol?.trim() || '#'}
                  </button>
                </div>
              )}
              {cols.includes('tax') && (
                <input
                  className="input num"
                  list="tax-rate-list"
                  value={it.tax_rate}
                  onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && update(it._key, { tax_rate: e.target.value })}
                  aria-label="Tax rate"
                />
              )}
              {cols.includes('amount') && (
                <div className="num line-amount" title={line ? `Taxable ${line.taxable_amount} + Tax ${line.tax_amount}` : ''}>
                  {line ? formatMoney(showTax ? line.total_amount : line.taxable_amount, doc) : '—'}
                </div>
              )}
              <div className="row-tools">
                {!it.product_id && it.name.trim() && (
                  <button type="button" className="icon-btn" title="Save to Products & Services" onClick={() => saveAsProduct(it)}>
                    <Icon name="save" size={16} />
                  </button>
                )}
                <button type="button" className="icon-btn danger" title="Remove item" onClick={() => remove(it._key)} aria-label={`Remove item ${index + 1}`}>
                  <Icon name="x" size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <datalist id="unit-list">
        {(settings.units || []).map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <datalist id="tax-rate-list">
        {(settings.taxRates || []).map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <button type="button" className="btn add-item" onClick={add} data-testid="add-item">
        <Icon name="plus" /> Add Item
      </button>
    </section>
  );
}
