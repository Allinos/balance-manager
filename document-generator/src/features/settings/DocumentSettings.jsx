import { useMemo, useState } from 'react';
import { Field, Select, TextArea, TextInput, Toggle } from '../../components/Form.jsx';
import { DOCUMENT_TYPES, TEMPLATES, getType } from '../../config/documentTypes.js';
import { DOC_SETTING_FIELDS, resolveDocSettings } from '../../config/defaults.js';
import { saveDocSettings } from '../../services/settingsService.js';
import { newDocument, renderPayload } from '../../services/documentService.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import PagePreview from '../../renderer/PagePreview.jsx';
import { SaveBar, useSettingsDraft } from './SettingsParts.jsx';

const ACCENTS = ['#1f4fd8', '#0f766e', '#7c3aed', '#b91c1c', '#c2410c', '#111827'];

/** Small sample document used to preview style changes. */
function useSamplePayload(overrides, companyOverride, typeId = 'TAX_INVOICE') {
  const { settings, company: savedCompany, docSettings } = useAppData();
  return useMemo(() => {
    const company = { ...(savedCompany || {}), ...(companyOverride || {}) };
    const ctx = { settings: { ...settings, ...overrides }, company, docSettings };
    const m = newDocument(typeId, ctx);
    m.document = {
      ...m.document,
      document_number: 'INV-00001',
      party_name: 'Sample Customer',
      party_address: '12, MG Road, Bengaluru',
      party_gstin: '29ABCDE1234F1Z5',
      place_of_supply: company?.state || '',
    };
    m.items = [
      { ...m.items[0], name: 'Office Chair', hsn_sac: '9401', quantity: '2', unit_price: '4500', tax_rate: '18' },
      { ...m.items[0], _key: 's2', name: 'Installation', hsn_sac: '995419', quantity: '1', unit: 'Job', unit_price: '1500', tax_rate: '18' },
    ];
    return renderPayload(m, ctx);
  }, [settings, savedCompany, companyOverride, docSettings, overrides, typeId]);
}

export function StylePreview({ overrides, company }) {
  const payload = useSamplePayload(overrides, company);
  return (
    <div className="style-preview">
      <PagePreview payload={payload} />
    </div>
  );
}

/** Settings → Documents: global defaults that apply to all document types. */
export default function DocumentSettings() {
  const { draft, set, dirty, save } = useSettingsDraft([
    'documentStyle', 'documentAccent', 'showBank', 'showHsn', 'showCustomerTaxId', 'showAmountInWords',
    'showSignature', 'showStamp', 'autoRoundOff', 'defaultPaymentTerms', 'qrContent', 'qrCustomText',
    'footerText', 'dateFormat', 'declaration', 'jurisdiction',
  ]);
  const overrides = useMemo(() => ({ ...draft }), [draft]);

  return (
    <div className="settings-section settings-split">
      <div>
        <h2>Documents</h2>
        <p className="muted">Defaults for every document. Individual types can override these under Document Types.</p>

        <Field label="Template" hint="Only changes the look — your documents and data are never modified">
          <div className="template-options compact">
            {TEMPLATES.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`style-option ${draft.documentStyle === t.id ? 'active' : ''}`}
                onClick={() => set({ documentStyle: t.id })}
                data-testid={`settings-template-${t.id}`}
              >
                <strong>{t.label}</strong>
                <span className="muted small">{t.description}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Accent colour">
          <div className="swatches">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch ${draft.documentAccent === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => set({ documentAccent: c })}
                aria-label={`Accent ${c}`}
              />
            ))}
            <input type="color" value={draft.documentAccent} onChange={(e) => set({ documentAccent: e.target.value })} aria-label="Custom colour" />
          </div>
        </Field>

        <div className="toggle-list">
          <Toggle checked={draft.showBank} onChange={(v) => set({ showBank: v })} label="Show bank details" />
          <Toggle checked={draft.showHsn} onChange={(v) => set({ showHsn: v })} label="Show HSN/SAC column" />
          <Toggle checked={draft.showCustomerTaxId} onChange={(v) => set({ showCustomerTaxId: v })} label="Show customer GSTIN / Tax ID" />
          <Toggle checked={draft.showAmountInWords} onChange={(v) => set({ showAmountInWords: v })} label="Show amount in words" />
          <Toggle checked={draft.showSignature} onChange={(v) => set({ showSignature: v })} label="Show signature block" />
          <Toggle checked={draft.showStamp} onChange={(v) => set({ showStamp: v })} label="Show company stamp" />
          <Toggle
            checked={draft.autoRoundOff}
            onChange={(v) => set({ autoRoundOff: v })}
            label="Round off totals to whole amounts"
            hint="Applies to new documents"
          />
        </div>

        <Field label="QR code content" hint="Turn the QR code on per document type under Document Types">
          <Select
            value={draft.qrContent}
            onChange={(v) => set({ qrContent: v })}
            options={[
              { value: 'UPI', label: 'UPI payment (uses your UPI ID)' },
              { value: 'DOCUMENT', label: 'Document reference (number, date, amount)' },
              { value: 'CONTACT', label: 'Company contact details' },
              { value: 'CUSTOM', label: 'Custom text or link' },
            ]}
          />
        </Field>
        {draft.qrContent === 'CUSTOM' && (
          <Field label="QR custom text">
            <TextInput value={draft.qrCustomText} onChange={(v) => set({ qrCustomText: v })} />
          </Field>
        )}
        <Field label="Default payment terms (invoices)">
          <TextArea rows={2} value={draft.defaultPaymentTerms} onChange={(v) => set({ defaultPaymentTerms: v })} />
        </Field>
        <Field label="Declaration (tax invoices)" hint="Printed at the bottom of invoices, as in Tally">
          <TextArea rows={2} value={draft.declaration} onChange={(v) => set({ declaration: v })} />
        </Field>
        <Field label="Jurisdiction" hint='e.g. "Mumbai" prints "SUBJECT TO MUMBAI JURISDICTION"'>
          <TextInput value={draft.jurisdiction} onChange={(v) => set({ jurisdiction: v })} maxLength={60} />
        </Field>
        <Field label="Footer text">
          <TextInput value={draft.footerText} onChange={(v) => set({ footerText: v })} />
        </Field>
        <SaveBar dirty={dirty} onSave={save} />
      </div>
      <StylePreview overrides={overrides} />
    </div>
  );
}

/** Settings → Document Types: per-type overrides (Invoice, Quotation, Challan, ...). */
export function DocumentTypeSettings() {
  const { settings, docSettings, setDocSettings } = useAppData();
  const toast = useToast();
  const [typeId, setTypeId] = useState('TAX_INVOICE');
  const [draft, setDraft] = useState(() => resolveDocSettings('TAX_INVOICE', settings, docSettings));
  const [dirty, setDirty] = useState(false);
  const type = getType(typeId);

  const choose = (id) => {
    setTypeId(id);
    setDraft(resolveDocSettings(id, settings, docSettings));
    setDirty(false);
  };
  const set = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const save = async () => {
    // Store only what differs from the defaults so global changes keep applying.
    const base = resolveDocSettings(typeId, settings, {});
    const overrides = Object.fromEntries(Object.entries(draft).filter(([k, v]) => base[k] !== v));
    try {
      await saveDocSettings(typeId, overrides);
      setDocSettings({ ...docSettings, [typeId]: overrides });
      setDirty(false);
      toast.success(`${type.label} settings saved`);
    } catch (e) {
      toast.error(e.message);
    }
  };
  const reset = async () => {
    try {
      await saveDocSettings(typeId, {});
      const next = { ...docSettings, [typeId]: {} };
      setDocSettings(next);
      setDraft(resolveDocSettings(typeId, settings, next));
      setDirty(false);
      toast.success('Restored defaults');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const fields = DOC_SETTING_FIELDS.filter((f) => !f.only || f.only.includes(type.dueSetting));

  return (
    <div className="settings-section">
      <h2>Document types</h2>
      <p className="muted">Each document type can have its own title, visible sections and default terms.</p>
      <div className="pill-row">
        {DOCUMENT_TYPES.map((t) => (
          <button key={t.id} className={`pill ${t.id === typeId ? 'active' : ''}`} onClick={() => choose(t.id)}>
            {t.short}
          </button>
        ))}
      </div>
      <div className="grid-2">
        <Field label="Template">
          <Select
            value={draft.template}
            onChange={(v) => set({ template: v })}
            options={TEMPLATES.map((t) => ({ value: t.id, label: t.id === (settings.documentStyle || 'tally-pro') ? `${t.label} (default)` : t.label }))}
            data-testid="type-template"
          />
        </Field>
        {fields
          .filter((f) => f.type === 'text' || f.type === 'number')
          .map((f) => (
            <Field key={f.key} label={f.label}>
              <TextInput
                type={f.type === 'number' ? 'number' : 'text'}
                min="0"
                value={draft[f.key] ?? ''}
                onChange={(v) => set({ [f.key]: f.type === 'number' ? Math.max(0, parseInt(v || '0', 10)) : v })}
              />
            </Field>
          ))}
      </div>
      <div className="toggle-list two-col">
        {fields
          .filter((f) => f.type === 'bool')
          .map((f) => (
            <Toggle key={f.key} checked={draft[f.key]} onChange={(v) => set({ [f.key]: v })} label={f.label} />
          ))}
      </div>
      {fields
        .filter((f) => f.type === 'textarea')
        .map((f) => (
          <Field key={f.key} label={f.label}>
            <TextArea rows={4} value={draft[f.key] ?? ''} onChange={(v) => set({ [f.key]: v })} />
          </Field>
        ))}
      <div className="row gap">
        <button className="btn btn-ghost" onClick={reset}>
          Restore defaults
        </button>
      </div>
      <SaveBar dirty={dirty} onSave={save} />
    </div>
  );
}
