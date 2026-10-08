/**
 * Create / edit any document type (same engine and rules as the desktop editor):
 * details · customer/vendor (saved parties) · additional details · items (saved products) or payment · totals · notes.
 * The number is assigned on the first save; Preview shows the document in its template.
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { EXTRA_FIELDS, PAYMENT_MODES, TYPE_MAP, getType, statusLabel, statusesFor } from '@desktop/config/documentTypes.js';
import { STATE_NAMES, isValidGstin, stateCode, stateFromGstin } from '@desktop/config/states.js';
import { isServiceUnit, unitOptions } from '@desktop/config/units.js';
import { isValidRate, rateValue, taxRateOptions } from '@desktop/config/taxRates.js';
import { blankItem, calculate, currencyInfo, getDocument, modelFromBundle, modelFromSource, newDocument, renderPayload, saveDocument } from '@desktop/services/documentService.js';
import { listParties, listProducts, saveProduct } from '@desktop/services/catalogService.js';
import { previewNumber } from '@desktop/services/settingsService.js';
import { exclusivePrice } from '@desktop/utils/calc.js';
import { formatMoney } from '@desktop/utils/format.js';
import { amountInWords } from '@desktop/utils/numberToWords.js';
import { dec, isZero } from '@desktop/utils/decimal.js';
import PagePreview from '@desktop/renderer/PagePreview.jsx';
import { balanceAfter, detachInvoice, invoicesForReceipt, PAPER_SIZES, receiptFromInvoice, settleInvoice } from '@desktop/services/receiptService.js';
import Icon from '../components/Icon.jsx';
import { ActionSheet, Field, Header, Input, NumberInput, Picker, Segmented, Select, Sheet, Spinner, StatusBadge, Suggest, TextArea, Toggle, back, go, useUi } from '../components/ui.jsx';
import { useApp, useDocContext, useDocumentActions } from '../data.jsx';

const stateOptions = STATE_NAMES.map((s) => ({ value: s, label: s, hint: stateCode(s) }));

function PartySection({ doc, type, onChange: change, saveParty, onSaveParty, taxSystem }) {
  const [shipOpen, setShipOpen] = useState(!!doc.shipping_address);
  const [edited, setEdited] = useState(false);
  const onChange = (patch) => {
    if (doc.party_id) setEdited(true);
    change(patch);
  };
  const noun = type.partyKind === 'vendor' ? 'vendor' : 'customer';
  const gstinChange = (v) => {
    const gstin = v.toUpperCase().replace(/\s/g, '');
    const state = stateFromGstin(gstin);
    return state && !doc.party_state ? { party_gstin: gstin, party_state: state, place_of_supply: state } : { party_gstin: gstin };
  };
  const pick = (p) => {
    setEdited(false);
    onSaveParty(false);
    change({
      party_id: p.id, party_name: p.name, party_company: p.company_name, party_address: p.address, party_phone: p.phone, party_email: p.email,
      party_gstin: p.gstin, party_tax_id: p.tax_id, party_state: p.state, shipping_address: p.shipping_address || '', place_of_supply: p.state || doc.place_of_supply,
    });
  };
  const fetchParties = useCallback((q) => listParties(q), []);
  return (
    <section className="card form">
      <div className="card-title">
        <h2>{type.partyLabel}</h2>
        {doc.party_id ? <span className="pill info">Saved {noun}</span> : null}
      </div>
      <Field label="Name" required>
        <Suggest
          value={doc.party_name}
          onChange={(v) => onChange({ party_name: v })}
          fetchOptions={fetchParties}
          onSelect={pick}
          placeholder={`Type ${noun} name or pick a saved one`}
          renderOption={(p) => (
            <>
              <strong>{p.name}</strong>
              <small>{[p.company_name, p.phone, p.gstin].filter(Boolean).join(' · ')}</small>
            </>
          )}
          inputProps={{ 'data-testid': 'party-name' }}
        />
      </Field>
      <Field label="Company">
        <Input value={doc.party_company} onChange={(v) => onChange({ party_company: v })} />
      </Field>
      <Field label="Address">
        <TextArea rows={2} value={doc.party_address} onChange={(v) => onChange({ party_address: v })} data-testid="party-address" />
      </Field>
      <div className="grid-2">
        <Field label="Phone">
          <Input type="tel" value={doc.party_phone} onChange={(v) => onChange({ party_phone: v })} data-testid="party-phone" />
        </Field>
        <Field label="Email">
          <Input type="email" value={doc.party_email} onChange={(v) => onChange({ party_email: v })} autoCapitalize="none" />
        </Field>
      </div>
      <Field
        label={taxSystem === 'GST' ? 'GSTIN' : 'Tax / VAT number'}
        hint={taxSystem === 'GST' ? (doc.party_gstin && !isValidGstin(doc.party_gstin) ? 'Check the GSTIN — 15 characters, e.g. 27AAPFU0939F1ZV' : 'Leave empty for unregistered customers. The state is filled in from it.') : ''}
      >
        <Input
          value={taxSystem === 'GST' ? doc.party_gstin : doc.party_tax_id}
          onChange={(v) => onChange(taxSystem === 'GST' ? gstinChange(v) : { party_tax_id: v })}
          maxLength={taxSystem === 'GST' ? 15 : 40}
          autoCapitalize="characters"
          data-testid="party-gstin"
        />
      </Field>
      <Field label="State">
        <Picker value={doc.party_state} onChange={(v) => onChange({ party_state: v || '', place_of_supply: v || '' })} options={stateOptions} placeholder="Choose state" title="State" creatable clearable testId="party-state" />
      </Field>
      {shipOpen ? (
        <Field label="Shipping address">
          <TextArea rows={2} value={doc.shipping_address} onChange={(v) => onChange({ shipping_address: v })} />
        </Field>
      ) : (
        <button type="button" className="btn btn-sm btn-ghost align-start" onClick={() => setShipOpen(true)}>
          + Different shipping address
        </button>
      )}
      {(!doc.party_id || edited) && (
        <label className="check-row">
          <input type="checkbox" checked={saveParty} onChange={(e) => onSaveParty(e.target.checked)} data-testid="save-party" />
          <span>{doc.party_id ? `Update the saved ${noun} with these details` : `Save this ${noun} for next time`}</span>
        </label>
      )}
    </section>
  );
}

function ItemCard({ it, index, line, doc, units, rateOptions, cols, onUpdate, onRemove, onPickProduct, onSaveProduct, purchase }) {
  const fetchProducts = useCallback((q) => listProducts({ search: q, limit: 8 }), []);
  const showTax = cols.tax;
  return (
    <div className="item-card" data-testid={`item-${index}`}>
      <div className="item-card-head">
        <span className="item-no">{index + 1}</span>
        <Suggest
          value={it.name}
          onChange={(v) => onUpdate({ name: v, product_id: it.name === v ? it.product_id : null })}
          fetchOptions={fetchProducts}
          onSelect={onPickProduct}
          placeholder="Product / service name"
          renderOption={(p) => (
            <>
              <strong>{p.name}</strong>
              <small>
                {[p.sku, p.hsn_sac && `HSN ${p.hsn_sac}`, formatMoney(purchase ? p.purchase_price : p.selling_price, { currency_symbol: doc.currency_symbol, currency: doc.currency }), `${p.tax_rate}%`].filter(Boolean).join(' · ')}
              </small>
            </>
          )}
          inputProps={{ 'data-testid': `item-name-${index}` }}
        />
        <button type="button" className="icon-btn sm danger" onClick={onRemove} aria-label={`Remove item ${index + 1}`} data-testid={`item-remove-${index}`}>
          <Icon name="x" size={18} />
        </button>
      </div>
      <input className="input input-desc" placeholder="Description (optional)" value={it.description} onChange={(e) => onUpdate({ description: e.target.value })} />
      <div className="grid-2">
        <Field label="Qty">
          <NumberInput value={it.quantity} onChange={(v) => onUpdate({ quantity: v })} data-testid={`item-qty-${index}`} />
        </Field>
        <Field label="Unit">
          <Picker value={it.unit} onChange={(v) => onUpdate({ unit: v || '' })} options={units} title="Unit" creatable testId={`item-unit-${index}`} />
        </Field>
        {cols.rate && (
          <Field label="Rate">
            <NumberInput value={it.unit_price} onChange={(v) => onUpdate({ unit_price: v })} data-testid={`item-rate-${index}`} />
          </Field>
        )}
        {cols.disc && (
          <Field label="Discount">
            <div className="disc-input">
              <NumberInput value={it.discount_value} onChange={(v) => onUpdate({ discount_value: v })} data-testid={`item-disc-${index}`} />
              <button type="button" className="disc-type" onClick={() => onUpdate({ discount_type: it.discount_type === 'PERCENT' ? 'AMOUNT' : 'PERCENT' })} data-testid={`item-disc-type-${index}`}>
                {it.discount_type === 'PERCENT' ? '%' : doc.currency_symbol?.trim() || '#'}
              </button>
            </div>
          </Field>
        )}
        {cols.hsn && (
          <Field label="HSN / SAC">
            <Input value={it.hsn_sac} onChange={(v) => onUpdate({ hsn_sac: v })} inputMode="numeric" data-testid={`item-hsn-${index}`} />
          </Field>
        )}
        {showTax && (
          <Field label={`${doc.tax_label || 'Tax'} %`}>
            <Picker value={rateValue(it.tax_rate)} onChange={(v) => v !== '' && isValidRate(v) && onUpdate({ tax_rate: v })} options={rateOptions} title="GST rate" creatable testId={`item-tax-${index}`} />
          </Field>
        )}
        {cols.pkg && (
          <Field label="Package" className="span-2">
            <Input value={it.package_info} onChange={(v) => onUpdate({ package_info: v })} placeholder="e.g. 2 boxes" />
          </Field>
        )}
      </div>
      <div className="item-card-foot">
        {!it.product_id && it.name.trim() ? (
          <button type="button" className="link-btn" onClick={onSaveProduct} data-testid={`item-save-product-${index}`}>
            <Icon name="save" size={15} /> Save to Products
          </button>
        ) : (
          <span />
        )}
        {cols.rate && line && (
          <strong className="amount" data-testid={`item-amount-${index}`}>
            {formatMoney(showTax ? line.total_amount : line.taxable_amount, doc)}
          </strong>
        )}
      </div>
    </div>
  );
}

function ItemsSection({ items, lines, doc, ds, settings, onChange }) {
  const { toast } = useUi();
  const showPrices = ds.showPrices !== false;
  const purchase = ['PURCHASE_ORDER', 'GOODS_RECEIPT'].includes(doc.document_type);
  const lineByKey = Object.fromEntries(lines.map((l) => [l._key, l]));
  const units = useMemo(() => unitOptions(settings.units || [], getType(doc.document_type).group === 'service' ? 'service' : 'product'), [settings.units, doc.document_type]);
  const rateOptions = useMemo(() => taxRateOptions(settings, undefined), [settings]);
  const cols = { hsn: ds.showHsn !== false, pkg: !!ds.showPackage, rate: showPrices, disc: showPrices, tax: showPrices && ds.showTax !== false && doc.tax_mode !== 'NONE' };
  const update = (key, patch) => onChange(items.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  const remove = (key) => {
    const next = items.filter((it) => it._key !== key);
    onChange(next.length ? next : [blankItem(settings, doc.document_type)]);
  };
  const pickProduct = (key, p) => {
    const rate = p.tax_type === 'EXEMPT' ? '0' : p.tax_rate;
    const basePrice = purchase && dec(p.purchase_price) > 0n ? p.purchase_price : p.selling_price;
    const price = p.tax_type === 'INCLUSIVE' ? exclusivePrice(basePrice, rate) : basePrice;
    update(key, { product_id: p.id, name: p.name, description: p.description, hsn_sac: p.hsn_sac, unit: p.unit, unit_price: price, tax_rate: settings.taxSystem === 'NONE' ? '0' : rate });
  };
  const saveAsProduct = async (it) => {
    try {
      const id = await saveProduct({
        type: it.hsn_sac?.startsWith('99') || isServiceUnit(it.unit) ? 'SERVICE' : 'PRODUCT',
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
      toast(`"${it.name.trim()}" saved to Products & Services`);
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  return (
    <section className="card form" data-testid="items">
      <div className="card-title">
        <h2>Items</h2>
        <span className="small muted">{items.length}</span>
      </div>
      {items.map((it, index) => (
        <ItemCard
          key={it._key}
          it={it}
          index={index}
          line={lineByKey[it._key]}
          doc={doc}
          units={units}
          rateOptions={rateOptions}
          cols={cols}
          purchase={purchase}
          onUpdate={(patch) => update(it._key, patch)}
          onRemove={() => remove(it._key)}
          onPickProduct={(p) => pickProduct(it._key, p)}
          onSaveProduct={() => saveAsProduct(it)}
        />
      ))}
      <button type="button" className="btn btn-block" onClick={() => onChange([...items, blankItem(settings, doc.document_type)])} data-testid="add-item">
        <Icon name="plus" size={18} /> Add item
      </button>
    </section>
  );
}

export default function Editor({ typeId, id, query = {} }) {
  const ctx = useDocContext();
  const { settings, company } = useApp();
  const { toast, confirm } = useUi();
  const actions = useDocumentActions();
  const [model, setModel] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveParty, setSaveParty] = useState(true);
  const [autoNumber, setAutoNumber] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [menu, setMenu] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let m;
        if (id) {
          m = modelFromBundle(await getDocument(id));
          if (m.document.status === 'CANCELLED' || m.document.status === 'VOID') {
            throw new Error(`${m.document.document_number} is cancelled and cannot be edited. Duplicate it to create a new document.`);
          }
        } else if (query.from) {
          m = modelFromSource(await getDocument(query.from), typeId, query.mode === 'convert' ? 'convert' : 'duplicate', ctx);
        } else {
          m = newDocument(typeId, ctx);
        }
        if (cancelled) return;
        setModel(m);
        const t = getType(m.document.document_type);
        setMoreOpen(t.optional.some((k) => m.document.meta?.[k]) || t.required.some((r) => r.startsWith('meta.') && r !== 'meta.amount_received'));
        setSaveParty(!m.document.party_id);
        if (query.from) setDirty(true);
      } catch (e) {
        if (!cancelled) setLoadError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const beforeUnload = (e) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  const doc = model?.document;
  const type = doc ? getType(doc.document_type) : null;

  useEffect(() => {
    if (!doc || doc.id) return;
    previewNumber(doc.document_type, type.prefix, doc.issue_date)
      .then(setAutoNumber)
      .catch(() => setAutoNumber(''));
  }, [doc?.id, doc?.document_type, doc?.issue_date, type?.prefix]); // eslint-disable-line react-hooks/exhaustive-deps

  const setDoc = useCallback(
    (patch) => {
      setModel((m) => {
        const next = { ...m.document, ...patch };
        // GST: CGST + SGST within the company's state, IGST for another state.
        if ('place_of_supply' in patch && ctx.settings.taxSystem === 'GST' && company?.state && next.tax_mode !== 'NONE') {
          const pos = (next.place_of_supply || '').trim().toLowerCase();
          if (pos) next.tax_mode = pos === company.state.trim().toLowerCase() ? 'INTRA' : 'INTER';
        }
        return { ...m, document: next };
      });
      setDirty(true);
    },
    [company?.state, ctx.settings.taxSystem],
  );
  const setMeta = (patch) => setDoc({ meta: { ...doc.meta, ...patch } });

  // Receipts: the invoices (or bills) a payment can be against, with what is still due.
  const [invoices, setInvoices] = useState([]);
  const receiptType = doc && getType(doc.document_type).layout === 'receipt' ? doc.document_type : null;
  useEffect(() => {
    if (!receiptType) return;
    invoicesForReceipt(receiptType, doc.id)
      .then((list) => {
        setInvoices(list);
        // Converted from an invoice: fill in what was received before and the balance.
        setModel((m) => {
          const d = m.document;
          const inv = d.parent_document_id && !d.meta.against_total ? list.find((i) => i.id === d.parent_document_id) : null;
          return inv ? { ...m, document: receiptFromInvoice(d, { ...inv, party_name: d.party_name, party_company: d.party_company }, inv.received) } : m;
        });
      })
      .catch(() => setInvoices([]));
  }, [receiptType]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseInvoice = async (value) => {
    const inv = invoices.find((i) => i.document_number.toLowerCase() === String(value || '').trim().toLowerCase());
    if (!inv) {
      const free = detachInvoice(doc);
      setDoc({ ...free, meta: { ...free.meta, against: value || '' } });
      return;
    }
    try {
      const full = (await getDocument(inv.id)).document;
      setDoc(receiptFromInvoice(doc, full, inv.received));
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  const setItems = (items) => {
    setModel((m) => ({ ...m, items }));
    setDirty(true);
  };

  const calc = useMemo(() => (model ? calculate(model, ctx) : null), [model, ctx]);
  const deferred = useDeferredValue(model);
  const payload = useMemo(
    () => (deferred && preview ? renderPayload({ ...deferred, document: { ...deferred.document, document_number: deferred.document.document_number || autoNumber } }, ctx) : null),
    [deferred, preview, ctx, autoNumber],
  );

  const leave = async () => {
    if (dirty && !(await confirm({ title: 'Discard your changes?', message: 'You have unsaved changes. If you leave now they will be lost.', confirmLabel: 'Discard', danger: true }))) return;
    setDirty(false);
    dirtyRef.current = false;
    if (doc?.id) go(`/doc/${doc.id}`, { replace: true });
    else back('/documents');
  };

  const save = async ({ print = false } = {}) => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await saveDocument(model, ctx, { saveCustomer: saveParty });
      setDirty(false);
      dirtyRef.current = false;
      toast(`${result.document_number} saved`);
      const inv = model.document.parent_document_id && invoices.find((i) => i.id === model.document.parent_document_id);
      if (inv) {
        const receipt = { ...model.document, document_number: result.document_number, grand_total: calc.totals.grand_total };
        const status = await settleInvoice(receipt, inv.status).catch(() => null);
        if (status) toast(`${inv.document_number} marked ${statusLabel(inv.document_type, status)}`);
      }
      go(`/doc/${result.id}${print ? '?print=1' : ''}`, { replace: true });
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <>
        <Header title="Document" onBack={() => go('/documents')} />
        <div className="page">
          <div className="alert alert-bad">{loadError}</div>
        </div>
      </>
    );
  }
  if (!model || !calc) return <Spinner />;

  const ds = calc.docSettings;
  const roundMode = ['AUTO', 'MANUAL'].includes(doc.meta.roundOffMode) ? doc.meta.roundOffMode : 'NONE';
  const t = calc.totals;
  const isReceipt = type.layout === 'receipt';
  const showPrices = ds.showPrices !== false;
  const currencies = settings.currencies?.length ? settings.currencies : [currencyInfo(settings, settings.baseCurrency)];
  const isNew = !doc.id;
  const hasBankDetails = ['bank_name', 'account_number', 'ifsc', 'iban', 'upi_id'].some((k) => company?.[k]);
  const taxModes =
    settings.taxSystem === 'GST'
      ? [
          { value: 'INTRA', label: 'CGST + SGST' },
          { value: 'INTER', label: 'IGST' },
          { value: 'NONE', label: 'No tax' },
        ]
      : settings.taxSystem === 'VAT'
        ? [
            { value: 'SIMPLE', label: settings.taxLabel || 'VAT' },
            { value: 'NONE', label: 'No tax' },
          ]
        : [{ value: 'NONE', label: 'No tax' }];

  return (
    <>
      <Header
        title={isNew ? `New ${type.label}` : `Edit ${doc.document_number}`}
        subtitle={dirty ? 'Unsaved changes' : undefined}
        onBack={leave}
        actions={
          <>
            <button className="icon-btn" onClick={() => setPreview(true)} aria-label="Preview" data-testid="preview">
              <Icon name="eye" size={21} />
            </button>
            {!isNew && (
              <button className="icon-btn" onClick={() => setMenu(true)} aria-label="More" data-testid="editor-more">
                <Icon name="more" size={21} />
              </button>
            )}
          </>
        }
      />
      <div className="page editor" data-testid="editor">
        {model.parent && (
          <div className="alert alert-info">
            Created from <strong>{model.parent.document_number}</strong> ({getType(model.parent.document_type).short})
          </div>
        )}

        <section className="card form">
          <div className="card-title">
            <h2>{type.label} details</h2>
            <StatusBadge status={doc.status} type={doc.document_type} />
          </div>
          <div className="grid-2">
            <Field label={`${type.short} no.`} hint="Empty = next number">
              <Input value={doc.document_number} onChange={(v) => setDoc({ document_number: v })} placeholder={autoNumber || 'Automatic'} data-testid="doc-number" />
            </Field>
            <Field label={type.dateLabel} required>
              <input className="input" type="date" value={doc.issue_date} onChange={(e) => setDoc({ issue_date: e.target.value })} data-testid="doc-date" />
            </Field>
            {type.dueLabel && (
              <Field label={type.dueLabel}>
                <input className="input" type="date" value={doc.due_date} onChange={(e) => setDoc({ due_date: e.target.value })} data-testid="doc-due" />
              </Field>
            )}
            <Field label="Status">
              <Select
                value={doc.status}
                onChange={(v) => setDoc({ status: v })}
                options={statusesFor(doc.document_type, doc.status)
                  .filter((s) => s !== 'CANCELLED' && s !== 'VOID')
                  .map((s) => ({ value: s, label: statusLabel(doc.document_type, s) }))}
                data-testid="doc-status"
              />
            </Field>
          </div>
          <Field label="Reference" hint="Printed for reference, e.g. the customer's PO or your job number.">
            <Input value={doc.reference} onChange={(v) => setDoc({ reference: v })} />
          </Field>
          {settings.taxSystem === 'GST' && !isReceipt && (
            <Field label="Place of supply" hint="Same state as yours → CGST + SGST; other state → IGST.">
              <Picker value={doc.place_of_supply} onChange={(v) => setDoc({ place_of_supply: v || '' })} options={stateOptions} placeholder="Choose state" title="Place of supply" creatable clearable testId="place-of-supply" />
            </Field>
          )}
          {showPrices && !isReceipt && settings.taxSystem !== 'NONE' && ds.showTax !== false && (
            <Field label="Tax">
              <Select value={doc.tax_mode} onChange={(v) => setDoc({ tax_mode: v })} options={taxModes} data-testid="tax-mode" />
            </Field>
          )}
          {currencies.length > 1 && (
            <Field label="Currency">
              <Picker
                value={doc.currency}
                onChange={(code) => {
                  const c = currencyInfo(settings, code);
                  setDoc({ currency: c.code, currency_symbol: c.symbol, currency_decimals: c.decimals, exchange_rate: code === settings.baseCurrency ? '1' : c.rate || '1' });
                }}
                options={currencies.map((c) => ({ value: c.code, label: c.code, hint: c.symbol?.trim() }))}
                title="Currency"
                testId="doc-currency"
              />
            </Field>
          )}
          {doc.currency !== settings.baseCurrency && (
            <Field label={`Exchange rate (1 ${doc.currency} = ? ${settings.baseCurrency})`}>
              <NumberInput value={doc.exchange_rate} onChange={(v) => setDoc({ exchange_rate: v })} />
            </Field>
          )}
        </section>

        {isReceipt && (
          <section className="card form" data-testid="receipt-for">
            <div className="card-title">
              <h2>{type.partyKind === 'vendor' ? 'Payment for bill' : 'Receipt for invoice'}</h2>
            </div>
            <Field label={type.partyKind === 'vendor' ? 'Against bill' : 'Against invoice'} hint="Choose the invoice: the customer, invoice amount and balance due are filled in.">
              <Picker
                value={doc.meta.against || ''}
                onChange={chooseInvoice}
                options={invoices.map((i) => ({
                  value: i.document_number,
                  label: `${i.document_number} · ${i.party_name || '—'}`,
                  hint: isZero(i.balance) ? 'Paid' : `Due ${formatMoney(i.balance, i)}`,
                }))}
                placeholder={type.partyKind === 'vendor' ? 'Choose a bill' : 'Choose an invoice'}
                title={type.partyKind === 'vendor' ? 'Against bill' : 'Against invoice'}
                creatable
                clearable
                testId="receipt-invoice"
              />
            </Field>
            {doc.meta.against_total && (
              <div className="receipt-settle" data-testid="receipt-balance">
                <span>
                  {type.partyKind === 'vendor' ? 'Bill' : 'Invoice'} <strong>{formatMoney(doc.meta.against_total, doc)}</strong>
                </span>
                <span>
                  {type.partyKind === 'vendor' ? 'Paid' : 'Received'} earlier <strong>{formatMoney(doc.meta.received_before || '0', doc)}</strong>
                </span>
                <span>
                  Balance after this {type.partyKind === 'vendor' ? 'payment' : 'receipt'}{' '}
                  <strong>{formatMoney(balanceAfter(doc.meta, t.grand_total, Number(doc.currency_decimals ?? 2)), doc)}</strong>
                </span>
              </div>
            )}
          </section>
        )}
        <PartySection doc={doc} type={type} onChange={setDoc} saveParty={saveParty} onSaveParty={setSaveParty} taxSystem={settings.taxSystem} />

        {type.optional.length > 0 && (
          <section className="card form">
            <button type="button" className="section-toggle" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} data-testid="more-details">
              <Icon name={moreOpen ? 'chevronDown' : 'chevronRight'} size={18} />
              <span>
                <strong>Additional details</strong>
                <span className="small muted block">
                  {type.optional
                    .slice(0, 3)
                    .map((k) => EXTRA_FIELDS[k]?.label)
                    .join(', ')}
                  {type.optional.length > 3 ? '…' : ''}
                </span>
              </span>
            </button>
            {moreOpen &&
              type.optional.map((k) => {
                const f = EXTRA_FIELDS[k];
                if (!f) return null;
                const value = doc.meta[k] ?? '';
                return (
                  <Field key={k} label={f.label} required={type.required.includes(`meta.${k}`)} hint={f.help}>
                    {f.type === 'date' ? (
                      <input className="input" type="date" value={value} onChange={(e) => setMeta({ [k]: e.target.value })} data-testid={`meta-${k}`} />
                    ) : f.type === 'yesno' ? (
                      <Select value={value || 'No'} onChange={(v) => setMeta({ [k]: v })} options={['No', 'Yes']} data-testid={`meta-${k}`} />
                    ) : (
                      <Input value={value} onChange={(v) => setMeta({ [k]: v })} maxLength={120} data-testid={`meta-${k}`} />
                    )}
                  </Field>
                );
              })}
          </section>
        )}

        {isReceipt ? (
          <section className="card form">
            <div className="card-title">
              <h2>Payment</h2>
            </div>
            <Field label={`Amount ${type.partyKind === 'vendor' ? 'paid' : 'received'} (${doc.currency_symbol.trim() || doc.currency})`} required>
              <NumberInput value={doc.meta.amount_received} onChange={(v) => setMeta({ amount_received: v })} data-testid="amount-received" />
            </Field>
            <div className="grid-2">
              <Field label="Payment mode">
                <Select value={doc.meta.payment_mode} onChange={(v) => setMeta({ payment_mode: v })} options={PAYMENT_MODES} data-testid="payment-mode" />
              </Field>
              <Field label="Transaction / cheque no.">
                <Input value={doc.meta.payment_reference} onChange={(v) => setMeta({ payment_reference: v })} />
              </Field>
            </div>
            <Field label="Paper size">
              <Segmented value={ds.paperSize} onChange={(v) => setMeta({ paperSize: v })} options={PAPER_SIZES.map((p) => ({ value: p.value, label: p.label }))} testId="paper-size" />
            </Field>
            {!isZero(t.grand_total) && <p className="words">{amountInWords(t.grand_total, doc.currency, Number(doc.currency_decimals))}</p>}
          </section>
        ) : (
          <ItemsSection items={model.items} lines={calc.lines} doc={doc} ds={ds} settings={settings} onChange={setItems} />
        )}

        {!isReceipt && showPrices && (
          <section className="card form" data-testid="totals">
            <div className="grid-2">
              <Field label="Shipping / freight">
                <NumberInput value={doc.shipping} onChange={(v) => setDoc({ shipping: v })} data-testid="shipping" />
              </Field>
              <Field label="Other charges">
                <NumberInput value={doc.other_charges} onChange={(v) => setDoc({ other_charges: v })} allowNegative data-testid="other-charges" />
              </Field>
            </div>
            {!isZero(doc.other_charges || '0') && (
              <Field label="Other charges label" hint="e.g. Packing, Loading, or Advance received (minus amount).">
                <Input value={doc.other_charges_label} onChange={(v) => setDoc({ other_charges_label: v })} />
              </Field>
            )}
            <div className="totals">
              <div>
                <span>Subtotal</span>
                <span>{formatMoney(t.subtotal, doc)}</span>
              </div>
              {!isZero(t.discount) && (
                <div>
                  <span>Discount</span>
                  <span>− {formatMoney(t.discount, doc)}</span>
                </div>
              )}
              {doc.tax_mode === 'INTRA' && ds.showTax !== false && (
                <>
                  <div>
                    <span>CGST</span>
                    <span data-testid="total-cgst">{formatMoney(t.cgst, doc)}</span>
                  </div>
                  <div>
                    <span>SGST</span>
                    <span data-testid="total-sgst">{formatMoney(t.sgst, doc)}</span>
                  </div>
                </>
              )}
              {doc.tax_mode === 'INTER' && ds.showTax !== false && (
                <div>
                  <span>IGST</span>
                  <span data-testid="total-igst">{formatMoney(t.igst, doc)}</span>
                </div>
              )}
              {doc.tax_mode === 'SIMPLE' && ds.showTax !== false && (
                <div>
                  <span>{doc.tax_label}</span>
                  <span>{formatMoney(t.tax, doc)}</span>
                </div>
              )}
              {!isZero(t.shipping) && (
                <div>
                  <span>Shipping</span>
                  <span>{formatMoney(t.shipping, doc)}</span>
                </div>
              )}
              {!isZero(t.other_charges) && (
                <div>
                  <span>{doc.other_charges_label || 'Other charges'}</span>
                  <span>{formatMoney(t.other_charges, doc)}</span>
                </div>
              )}
              <div className="roundoff" data-testid="round-off">
                <span>Round off</span>
                <span className="radio-group">
                  <label>
                    <input type="radio" name="round-off" checked={roundMode === 'NONE'} onChange={() => setMeta({ roundOffMode: 'NONE' })} data-testid="round-off-no" /> No
                  </label>
                  <label>
                    <input type="radio" name="round-off" checked={roundMode === 'AUTO'} onChange={() => setMeta({ roundOffMode: 'AUTO' })} data-testid="round-off-yes" /> Yes
                  </label>
                </span>
                <span>{isZero(t.round_off) ? '—' : formatMoney(t.round_off, doc)}</span>
              </div>
              <div className="grand">
                <span>Grand total</span>
                <span data-testid="grand-total">{formatMoney(t.grand_total, doc)}</span>
              </div>
            </div>
            <p className="words" data-testid="amount-words">
              {amountInWords(t.grand_total, doc.currency, Number(doc.currency_decimals))}
            </p>
          </section>
        )}

        <section className="card form">
          <Field label="Notes (shown on the document)">
            <TextArea rows={2} value={doc.notes} onChange={(v) => setDoc({ notes: v })} placeholder="e.g. Thank you for your business!" data-testid="doc-notes" />
          </Field>
          <Field label="Terms & conditions">
            <TextArea rows={3} value={doc.terms} onChange={(v) => setDoc({ terms: v })} data-testid="doc-terms" />
          </Field>
          {type.bankOption && showPrices && (
            <>
              <Toggle checked={ds.showBank !== false} onChange={(v) => setMeta({ showBank: v })} label="Show bank details" data-testid="show-bank" />
              {!hasBankDetails && <span className="field-hint">Add your bank details in Settings → Company to print them.</span>}
            </>
          )}
        </section>

        {type.conversions.length > 0 && isNew && !model.parent && (
          <p className="small muted center">
            After saving you can convert this {type.short.toLowerCase()} into {type.conversions.map((c) => TYPE_MAP[c].short).join(', ')}.
          </p>
        )}
      </div>

      <div className="save-bar no-print">
        <button className="btn" onClick={() => save({ print: true })} disabled={saving} data-testid="save-print">
          <Icon name="printer" size={18} /> Save &amp; Print
        </button>
        <button className="btn btn-primary" onClick={() => save()} disabled={saving} data-testid="save-doc">
          <Icon name="save" size={18} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {preview && payload && (
        <Sheet full title="Preview" onClose={() => setPreview(false)} testId="preview-sheet">
          <div className="preview-wrap">
            <PagePreview payload={payload} />
          </div>
        </Sheet>
      )}
      {menu && (
        <ActionSheet
          title={doc.document_number}
          onClose={() => setMenu(false)}
          items={[
            { label: 'Duplicate', icon: 'copy', onClick: () => actions.duplicate(doc) },
            {
              label: 'Delete',
              icon: 'trash',
              danger: true,
              onClick: async () => {
                if (await actions.remove(doc)) {
                  setDirty(false);
                  go('/documents', { replace: true });
                }
              },
            },
          ]}
        />
      )}
    </>
  );
}
