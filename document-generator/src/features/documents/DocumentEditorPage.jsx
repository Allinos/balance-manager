import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Field, NumberInput, Select, TextArea, TextInput } from '../../components/Form.jsx';
import { Menu, Spinner, StatusBadge } from '../../components/Common.jsx';
import { getType, PAYMENT_MODES, STATUSES, STATUS_LABELS, TYPE_MAP } from '../../config/documentTypes.js';
import {
  calculate,
  currencyInfo,
  getDocument,
  modelFromBundle,
  modelFromSource,
  newDocument,
  renderPayload,
  saveDocument,
} from '../../services/documentService.js';
import { previewNumber } from '../../services/settingsService.js';
import { formatMoney } from '../../utils/format.js';
import { amountInWords } from '../../utils/numberToWords.js';
import { isZero } from '../../utils/decimal.js';
import { useAppData, useDocContext } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import { useShortcuts } from '../../hooks/useShortcuts.js';
import { setLeaveGuard, useRouter } from '../../router/router.jsx';
import PagePreview from '../../renderer/PagePreview.jsx';
import PartyFields from './editor/PartyFields.jsx';
import { useDocumentActions } from './useDocumentActions.js';
import ItemsEditor from './editor/ItemsEditor.jsx';

const PREVIEW_KEY = 'docgen.editor.preview';

function readPreviewPref() {
  try {
    const v = localStorage.getItem(PREVIEW_KEY);
    if (v !== null) return v === '1';
  } catch {
    /* storage unavailable */
  }
  return window.innerWidth >= 1500;
}

export default function DocumentEditorPage({ params, query }) {
  const ctx = useDocContext();
  const { settings, company } = useAppData();
  const { navigate } = useRouter();
  const toast = useToast();
  const actions = useDocumentActions();

  const [model, setModel] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveParty, setSaveParty] = useState(true);
  const [autoNumber, setAutoNumber] = useState('');
  const [showPreview, setShowPreview] = useState(readPreviewPref);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  // Load / create the model once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let m;
        if (params.id) {
          m = modelFromBundle(await getDocument(params.id));
        } else if (query.from) {
          m = modelFromSource(await getDocument(query.from), params.type, query.mode === 'convert' ? 'convert' : 'duplicate', ctx);
        } else {
          m = newDocument(params.type, ctx);
        }
        if (!cancelled) {
          setModel(m);
          setSaveParty(!m.document.party_id);
          if (query.from) setDirty(true);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    setLeaveGuard(() => (dirtyRef.current ? 'You have unsaved changes. If you leave now they will be lost.' : ''));
    const beforeUnload = (e) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      setLeaveGuard(null);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);

  const doc = model?.document;
  const type = doc ? getType(doc.document_type) : null;

  // Preview of the automatic number for new documents.
  useEffect(() => {
    if (!doc || doc.id) return;
    previewNumber(doc.document_type, type.prefix, doc.issue_date)
      .then(setAutoNumber)
      .catch(() => setAutoNumber(''));
  }, [doc?.id, doc?.document_type, doc?.issue_date, type?.prefix]); // eslint-disable-line react-hooks/exhaustive-deps

  const setDoc = useCallback((patch) => {
    setModel((m) => {
      const next = { ...m.document, ...patch };
      // GST: choose CGST+SGST or IGST automatically from the place of supply.
      if ('place_of_supply' in patch && ctx.settings.taxSystem === 'GST' && company?.state && next.tax_mode !== 'NONE') {
        const pos = (next.place_of_supply || '').trim().toLowerCase();
        if (pos) next.tax_mode = pos === company.state.trim().toLowerCase() ? 'INTRA' : 'INTER';
      }
      return { ...m, document: next };
    });
    setDirty(true);
  }, [company?.state, ctx.settings.taxSystem]);

  const setMeta = (patch) => setDoc({ meta: { ...doc.meta, ...patch } });
  const setItems = (items) => {
    setModel((m) => ({ ...m, items }));
    setDirty(true);
  };

  const calc = useMemo(() => (model ? calculate(model, ctx) : null), [model, ctx]);
  const deferredModel = useDeferredValue(model);
  const payload = useMemo(
    () => (deferredModel && showPreview ? renderPayload({ ...deferredModel, document: { ...deferredModel.document, document_number: deferredModel.document.document_number || autoNumber } }, ctx) : null),
    [deferredModel, showPreview, ctx, autoNumber],
  );

  const togglePreview = () => {
    setShowPreview((v) => {
      try {
        localStorage.setItem(PREVIEW_KEY, v ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  const save = async ({ print = false } = {}) => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await saveDocument(model, ctx, { saveCustomer: saveParty });
      setDirty(false);
      dirtyRef.current = false;
      toast.success(`${result.document_number} saved`);
      navigate(`/doc/${result.id}${print ? '?print=1' : ''}`, { replace: true, force: true });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  useShortcuts({
    'mod+s': () => save(),
    'mod+p': () => save({ print: true }),
  });

  if (loadError) {
    return (
      <div className="page">
        <div className="callout callout-error">
          <Icon name="alert" /> {loadError}
          <button className="btn btn-sm" onClick={() => navigate('/documents', { force: true })}>
            Back to Documents
          </button>
        </div>
      </div>
    );
  }
  if (!model || !calc) return <Spinner />;

  const ds = calc.docSettings;
  const t = calc.totals;
  const isReceipt = type.layout === 'receipt';
  const showPrices = ds.showPrices !== false;
  const currencies = settings.currencies?.length ? settings.currencies : [currencyInfo(settings, settings.baseCurrency)];
  const isNew = !doc.id;

  const taxModes =
    settings.taxSystem === 'GST'
      ? [
          { value: 'INTRA', label: 'CGST + SGST (same state)' },
          { value: 'INTER', label: 'IGST (other state)' },
          { value: 'NONE', label: 'No tax' },
        ]
      : settings.taxSystem === 'VAT'
        ? [
            { value: 'SIMPLE', label: settings.taxLabel || 'VAT' },
            { value: 'NONE', label: 'No tax' },
          ]
        : [{ value: 'NONE', label: 'No tax' }];

  return (
    <div className={`editor ${showPreview ? 'with-preview' : ''}`}>
      <div className="editor-bar no-print">
        <button className="icon-btn" onClick={() => navigate(doc.id ? `/doc/${doc.id}` : '/documents')} title="Back">
          <Icon name="back" />
        </button>
        <div className="editor-title">
          <h1>
            {isNew ? `New ${type.label}` : `Edit ${doc.document_number}`}
            {dirty && <span className="unsaved" title="Unsaved changes">●</span>}
          </h1>
          <StatusBadge status={doc.status} />
        </div>
        <div className="editor-actions">
          <button className={`btn ${showPreview ? 'active' : ''}`} onClick={togglePreview} title="Show/hide live preview">
            <Icon name="eye" /> Preview
          </button>
          <button className="btn" onClick={() => save({ print: true })} disabled={saving} title="Save & Print (Ctrl+P)">
            <Icon name="printer" /> Save &amp; Print
          </button>
          <button className="btn btn-primary" onClick={() => save()} disabled={saving} title="Save (Ctrl+S)" data-testid="save-doc">
            <Icon name="save" /> {saving ? 'Saving…' : 'Save'}
          </button>
          {!isNew && (
            <Menu
              items={[
                { label: 'Duplicate', icon: 'copy', onClick: () => actions.duplicate(doc) },
                {
                  label: 'Delete',
                  icon: 'trash',
                  danger: true,
                  onClick: async () => {
                    if (await actions.remove(doc)) {
                      setDirty(false);
                      dirtyRef.current = false;
                      navigate('/created', { force: true });
                    }
                  },
                },
              ]}
            />
          )}
        </div>
      </div>

      <div className="editor-body">
        <div className="editor-form">
          {model.parent && (
            <div className="callout">
              <Icon name="convert" />
              <span>
                Created from <strong>{model.parent.document_number}</strong> ({getType(model.parent.document_type).short})
              </span>
            </div>
          )}

          <section className="card editor-section">
            <div className="card-header">
              <h2>{type.label} details</h2>
            </div>
            <div className="grid-4">
              <Field label={`${type.short} number`} hint={isNew && !doc.document_number ? 'Leave empty for automatic numbering' : ''}>
                <TextInput value={doc.document_number} onChange={(v) => setDoc({ document_number: v })} placeholder={autoNumber || 'Automatic'} />
              </Field>
              <Field label={type.dateLabel} required>
                <input className="input" type="date" value={doc.issue_date} onChange={(e) => setDoc({ issue_date: e.target.value })} />
              </Field>
              {type.dueLabel && (
                <Field label={type.dueLabel}>
                  <input className="input" type="date" value={doc.due_date} onChange={(e) => setDoc({ due_date: e.target.value })} />
                </Field>
              )}
              <Field label="Status">
                <Select value={doc.status} onChange={(v) => setDoc({ status: v })} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
              </Field>
              <Field label="Reference" hint="PO / order / invoice no.">
                <TextInput value={doc.reference} onChange={(v) => setDoc({ reference: v })} />
              </Field>
              {showPrices && !isReceipt && settings.taxSystem !== 'NONE' && ds.showTax !== false && (
                <Field label="Tax">
                  <Select value={doc.tax_mode} onChange={(v) => setDoc({ tax_mode: v })} options={taxModes} />
                </Field>
              )}
              {settings.taxSystem === 'GST' && !isReceipt && (
                <Field label="Place of supply">
                  <TextInput value={doc.place_of_supply} onChange={(v) => setDoc({ place_of_supply: v })} list="indian-states" />
                </Field>
              )}
              {currencies.length > 1 && (
                <Field label="Currency">
                  <Select
                    value={doc.currency}
                    onChange={(code) => {
                      const c = currencyInfo(settings, code);
                      setDoc({
                        currency: c.code,
                        currency_symbol: c.symbol,
                        currency_decimals: c.decimals,
                        exchange_rate: code === settings.baseCurrency ? '1' : c.rate || '1',
                      });
                    }}
                    options={currencies.map((c) => ({ value: c.code, label: `${c.code} ${c.symbol ? `(${c.symbol.trim()})` : ''}` }))}
                  />
                </Field>
              )}
              {doc.currency !== settings.baseCurrency && (
                <Field label={`Exchange rate (1 ${doc.currency} = ? ${settings.baseCurrency})`}>
                  <NumberInput value={doc.exchange_rate} onChange={(v) => setDoc({ exchange_rate: v })} />
                </Field>
              )}
            </div>
          </section>

          <PartyFields
            doc={doc}
            type={type}
            onChange={setDoc}
            saveParty={saveParty}
            onSaveParty={setSaveParty}
            taxSystem={settings.taxSystem}
          />

          {isReceipt ? (
            <section className="card editor-section">
              <div className="card-header">
                <h2>Payment</h2>
              </div>
              <div className="grid-4">
                <Field label={`Amount received (${doc.currency_symbol.trim() || doc.currency})`} required>
                  <NumberInput value={doc.meta.amount_received} onChange={(v) => setMeta({ amount_received: v })} data-testid="amount-received" />
                </Field>
                <Field label="Payment mode">
                  <Select value={doc.meta.payment_mode} onChange={(v) => setMeta({ payment_mode: v })} options={PAYMENT_MODES} />
                </Field>
                <Field label="Transaction / cheque no.">
                  <TextInput value={doc.meta.payment_reference} onChange={(v) => setMeta({ payment_reference: v })} />
                </Field>
                <Field label="Against invoice">
                  <TextInput value={doc.meta.against} onChange={(v) => setMeta({ against: v })} placeholder="e.g. INV-00012" />
                </Field>
              </div>
              {!isZero(t.grand_total) && <p className="words-preview">{amountInWords(t.grand_total, doc.currency, Number(doc.currency_decimals))}</p>}
            </section>
          ) : (
            <ItemsEditor items={model.items} lines={calc.lines} doc={doc} ds={ds} settings={settings} onChange={setItems} />
          )}

          {!isReceipt && showPrices && (
            <section className="card editor-section totals-section">
              <div className="grid-2 totals-inputs">
                <Field label="Shipping / freight">
                  <NumberInput value={doc.shipping} onChange={(v) => setDoc({ shipping: v })} />
                </Field>
                <div className="grid-2 tight">
                  <Field label="Other charges label">
                    <TextInput value={doc.other_charges_label} onChange={(v) => setDoc({ other_charges_label: v })} />
                  </Field>
                  <Field label="Amount">
                    <NumberInput value={doc.other_charges} onChange={(v) => setDoc({ other_charges: v })} allowNegative />
                  </Field>
                </div>
                <Field label="Round off">
                  <Select
                    value={doc.meta.roundOffMode || 'NONE'}
                    onChange={(v) => setMeta({ roundOffMode: v })}
                    options={[
                      { value: 'AUTO', label: 'Round to nearest whole amount' },
                      { value: 'NONE', label: 'No rounding' },
                      { value: 'MANUAL', label: 'Enter manually' },
                    ]}
                  />
                </Field>
                {doc.meta.roundOffMode === 'MANUAL' && (
                  <Field label="Round off amount (+/−)">
                    <NumberInput value={doc.round_off} onChange={(v) => setDoc({ round_off: v })} allowNegative />
                  </Field>
                )}
              </div>
              <div className="totals-box" data-testid="totals">
                <div><span>Subtotal</span><span>{formatMoney(t.subtotal, doc)}</span></div>
                {!isZero(t.discount) && <div><span>Discount</span><span>− {formatMoney(t.discount, doc)}</span></div>}
                {doc.tax_mode === 'INTRA' && ds.showTax !== false && (
                  <>
                    <div><span>CGST</span><span data-testid="total-cgst">{formatMoney(t.cgst, doc)}</span></div>
                    <div><span>SGST</span><span data-testid="total-sgst">{formatMoney(t.sgst, doc)}</span></div>
                  </>
                )}
                {doc.tax_mode === 'INTER' && ds.showTax !== false && <div><span>IGST</span><span>{formatMoney(t.igst, doc)}</span></div>}
                {doc.tax_mode === 'SIMPLE' && ds.showTax !== false && <div><span>{doc.tax_label}</span><span>{formatMoney(t.tax, doc)}</span></div>}
                {!isZero(t.shipping) && <div><span>Shipping</span><span>{formatMoney(t.shipping, doc)}</span></div>}
                {!isZero(t.other_charges) && <div><span>{doc.other_charges_label || 'Other charges'}</span><span>{formatMoney(t.other_charges, doc)}</span></div>}
                {!isZero(t.round_off) && <div><span>Round off</span><span>{formatMoney(t.round_off, doc)}</span></div>}
                <div className="grand"><span>Grand Total</span><span data-testid="grand-total">{formatMoney(t.grand_total, doc)}</span></div>
                <p className="words-preview">{amountInWords(t.grand_total, doc.currency, Number(doc.currency_decimals))}</p>
              </div>
            </section>
          )}

          <section className="card editor-section">
            <div className="grid-2">
              <Field label="Notes (shown on the document)">
                <TextArea rows={3} value={doc.notes} onChange={(v) => setDoc({ notes: v })} placeholder="e.g. Thank you for your business!" />
              </Field>
              <Field label="Terms & conditions">
                <TextArea rows={3} value={doc.terms} onChange={(v) => setDoc({ terms: v })} />
              </Field>
            </div>
          </section>

          {type.conversions.length > 0 && isNew && !model.parent && (
            <p className="muted small center">
              After saving you can convert this {type.short.toLowerCase()} into{' '}
              {type.conversions.map((c) => TYPE_MAP[c].short).join(', ')}.
            </p>
          )}
        </div>

        {showPreview && payload && (
          <aside className="editor-preview no-print" aria-label="Live preview">
            <PagePreview payload={payload} />
          </aside>
        )}
      </div>
    </div>
  );
}
