/** Settings → Company, Documents (template, copies, colours, what is printed) and Document Types. */

import { useMemo, useState } from 'react';
import { DOCUMENT_TYPES, TEMPLATES, getType } from '@desktop/config/documentTypes.js';
import { DOC_SETTING_FIELDS, resolveDocSettings } from '@desktop/config/defaults.js';
import { STATE_NAMES, stateCode } from '@desktop/config/states.js';
import { saveCompany, saveDocSettings } from '@desktop/services/settingsService.js';
import { Field, Input, Picker, Segmented, Select, TextArea, Toggle, useUi } from '../../components/ui.jsx';
import { ImagePicker, SamplePreview } from '../../components/docs.jsx';
import { useApp } from '../../data.jsx';
import { SaveBar, useSettingsDraft } from './parts.jsx';

const EMPTY = {
  name: '', legal_name: '', trade_name: '', address: '', city: '', state: '', pin: '', country: 'India', phone: '', email: '', website: '', gstin: '',
  pan: '', vat_number: '', logo: '', stamp: '', signature: '', bank_name: '', account_holder: '', account_number: '', ifsc: '', swift: '', iban: '',
  branch: '', upi_id: '',
};
const stateOptions = STATE_NAMES.map((s) => ({ value: s, label: s, hint: stateCode(s) }));

export function CompanySection() {
  const { company, setCompany, settings } = useApp();
  const { toast } = useUi();
  const [c, setC] = useState({ ...EMPTY, ...(company || {}) });
  const [dirty, setDirty] = useState(false);
  const set = (patch) => {
    setC((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  const save = async () => {
    try {
      setCompany(await saveCompany(c));
      setDirty(false);
      toast('Company details saved');
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  return (
    <>
      <div className="page form" data-testid="settings-company">
        <p className="muted small" style={{ margin: 0 }}>
          These details appear on every document.
        </p>
        <div className="image-row">
          <ImagePicker label="Logo" value={c.logo} onChange={(v) => set({ logo: v })} testId="logo-pick" />
          <ImagePicker label="Signature" value={c.signature} onChange={(v) => set({ signature: v })} testId="signature-pick" />
          <ImagePicker label="Stamp" value={c.stamp} onChange={(v) => set({ stamp: v })} testId="stamp-pick" />
        </div>
        <Field label="Company name" required>
          <Input value={c.name} onChange={(v) => set({ name: v })} data-testid="company-name" />
        </Field>
        <div className="grid-2">
          <Field label="Legal name">
            <Input value={c.legal_name} onChange={(v) => set({ legal_name: v })} />
          </Field>
          <Field label="Trade name">
            <Input value={c.trade_name} onChange={(v) => set({ trade_name: v })} />
          </Field>
        </div>
        <Field label="Address">
          <TextArea rows={2} value={c.address} onChange={(v) => set({ address: v })} data-testid="company-address" />
        </Field>
        <div className="grid-2">
          <Field label="City">
            <Input value={c.city} onChange={(v) => set({ city: v })} />
          </Field>
          <Field label="PIN / ZIP">
            <Input value={c.pin} onChange={(v) => set({ pin: v })} inputMode="numeric" />
          </Field>
        </div>
        <Field label="State" hint={settings.taxSystem === 'GST' ? 'Decides CGST + SGST or IGST automatically' : ''}>
          <Picker value={c.state} onChange={(v) => set({ state: v || '' })} options={stateOptions} placeholder="Choose state" title="State" creatable clearable testId="company-state" />
        </Field>
        <div className="grid-2">
          <Field label="Country">
            <Input value={c.country} onChange={(v) => set({ country: v })} />
          </Field>
          <Field label="Phone">
            <Input type="tel" value={c.phone} onChange={(v) => set({ phone: v })} data-testid="company-phone" />
          </Field>
        </div>
        <Field label="Email">
          <Input type="email" value={c.email} onChange={(v) => set({ email: v })} autoCapitalize="none" />
        </Field>
        <Field label="Website">
          <Input value={c.website} onChange={(v) => set({ website: v })} autoCapitalize="none" />
        </Field>
        <div className="grid-2">
          <Field label="GSTIN">
            <Input value={c.gstin} onChange={(v) => set({ gstin: v.toUpperCase() })} maxLength={15} data-testid="company-gstin" />
          </Field>
          <Field label="PAN">
            <Input value={c.pan} onChange={(v) => set({ pan: v.toUpperCase() })} maxLength={10} />
          </Field>
        </div>
        <Field label="VAT number">
          <Input value={c.vat_number} onChange={(v) => set({ vat_number: v })} />
        </Field>

        <div className="section-label">Bank details & UPI</div>
        <Field label="UPI ID" hint="For the UPI payment QR code on invoices">
          <Input value={c.upi_id} onChange={(v) => set({ upi_id: v })} placeholder="yourname@okhdfcbank" autoCapitalize="none" data-testid="company-upi" />
        </Field>
        <div className="grid-2">
          <Field label="Bank name">
            <Input value={c.bank_name} onChange={(v) => set({ bank_name: v })} data-testid="company-bank-name" />
          </Field>
          <Field label="Branch">
            <Input value={c.branch} onChange={(v) => set({ branch: v })} />
          </Field>
        </div>
        <Field label="Account holder">
          <Input value={c.account_holder} onChange={(v) => set({ account_holder: v })} />
        </Field>
        <div className="grid-2">
          <Field label="Account number">
            <Input value={c.account_number} onChange={(v) => set({ account_number: v })} inputMode="numeric" data-testid="company-account-number" />
          </Field>
          <Field label="IFSC">
            <Input value={c.ifsc} onChange={(v) => set({ ifsc: v.toUpperCase() })} maxLength={11} data-testid="company-ifsc" />
          </Field>
          <Field label="SWIFT">
            <Input value={c.swift} onChange={(v) => set({ swift: v.toUpperCase() })} />
          </Field>
          <Field label="IBAN">
            <Input value={c.iban} onChange={(v) => set({ iban: v.toUpperCase() })} />
          </Field>
        </div>
      </div>
      <SaveBar dirty={dirty} onSave={save} />
    </>
  );
}

const ACCENTS = ['#1f4fd8', '#0f766e', '#7c3aed', '#b91c1c', '#c2410c', '#111827'];

export function DocumentsSection() {
  const { draft, set, dirty, save } = useSettingsDraft([
    'documentStyle', 'documentAccent', 'showBank', 'showHsn', 'showCustomerTaxId', 'showAmountInWords', 'showSignature', 'showStamp', 'autoRoundOff',
    'defaultPaymentTerms', 'qrContent', 'qrCustomText', 'footerText', 'declaration', 'jurisdiction', 'documentCopies',
  ]);
  const overrides = useMemo(() => ({ ...draft }), [draft]);
  return (
    <>
      <div className="page form" data-testid="settings-documents">
        <p className="muted small" style={{ margin: 0 }}>
          Defaults for every document. Document Types can change them for one type.
        </p>
        <Field label="Template" hint="Only changes the look — your documents and data are never modified">
          <div className="template-options">
            {TEMPLATES.map((t) => (
              <button type="button" key={t.id} className={`template-option ${draft.documentStyle === t.id ? 'active' : ''}`} onClick={() => set({ documentStyle: t.id })} data-testid={`settings-template-${t.id}`}>
                <strong>{t.label}</strong>
                <span className="small muted">{t.description}</span>
              </button>
            ))}
          </div>
        </Field>
        <SamplePreview overrides={overrides} />
        <Field label="Number of copies" hint="Printed / saved as PDF. GST invoices are labelled Original for Recipient, Duplicate for Transporter, Triplicate for Supplier.">
          <Segmented
            value={String(draft.documentCopies || 1)}
            onChange={(v) => set({ documentCopies: Number(v) })}
            options={[
              { value: '1', label: 'Single' },
              { value: '2', label: 'Double' },
              { value: '3', label: 'Triple' },
              { value: '4', label: '4' },
            ]}
            testId="copies"
          />
        </Field>
        <Field label="Accent colour">
          <div className="swatches">
            {ACCENTS.map((c) => (
              <button key={c} type="button" className={`swatch ${draft.documentAccent === c ? 'active' : ''}`} style={{ background: c }} onClick={() => set({ documentAccent: c })} aria-label={`Accent ${c}`} />
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
          <Toggle checked={draft.autoRoundOff} onChange={(v) => set({ autoRoundOff: v })} label="Round off totals to whole amounts" hint="Applies to new documents" />
        </div>
        <Field label="QR code content" hint="Turn the QR code on per document type under Document Types.">
          <Select
            value={draft.qrContent}
            onChange={(v) => set({ qrContent: v })}
            options={[
              { value: 'UPI', label: 'UPI payment (uses your UPI ID)' },
              { value: 'DOCUMENT', label: 'Document reference' },
              { value: 'CONTACT', label: 'Company contact details' },
              { value: 'CUSTOM', label: 'Custom text or link' },
            ]}
          />
        </Field>
        {draft.qrContent === 'CUSTOM' && (
          <Field label="QR custom text">
            <Input value={draft.qrCustomText} onChange={(v) => set({ qrCustomText: v })} />
          </Field>
        )}
        <Field label="Default payment terms (invoices)">
          <TextArea rows={2} value={draft.defaultPaymentTerms} onChange={(v) => set({ defaultPaymentTerms: v })} />
        </Field>
        <Field label="Declaration (tax invoices)">
          <TextArea rows={3} value={draft.declaration} onChange={(v) => set({ declaration: v })} />
        </Field>
        <Field label="Jurisdiction" hint='"Mumbai" prints "SUBJECT TO MUMBAI JURISDICTION"'>
          <Input value={draft.jurisdiction} onChange={(v) => set({ jurisdiction: v })} maxLength={60} />
        </Field>
        <Field label="Footer text">
          <Input value={draft.footerText} onChange={(v) => set({ footerText: v })} />
        </Field>
      </div>
      <SaveBar dirty={dirty} onSave={save} />
    </>
  );
}

/** Per-type overrides (Invoice, Quotation, Challan …): title, template, what is shown, default days, notes and terms. */
export function DocumentTypesSection() {
  const { settings, docSettings, setDocSettings } = useApp();
  const { toast } = useUi();
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
    // Only what differs from the defaults is stored, so later global changes keep applying.
    const base = resolveDocSettings(typeId, settings, {});
    const overrides = Object.fromEntries(Object.entries(draft).filter(([k, v]) => base[k] !== v));
    try {
      await saveDocSettings(typeId, overrides);
      setDocSettings({ ...docSettings, [typeId]: overrides });
      setDirty(false);
      toast(`${type.label} settings saved`);
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  const reset = async () => {
    await saveDocSettings(typeId, {});
    const next = { ...docSettings, [typeId]: {} };
    setDocSettings(next);
    setDraft(resolveDocSettings(typeId, settings, next));
    setDirty(false);
    toast('Restored defaults');
  };
  const fields = DOC_SETTING_FIELDS.filter((f) => !f.only || f.only.includes(type.dueSetting));
  return (
    <>
      <div className="page form" data-testid="settings-types">
        <Field label="Document type">
          <Picker value={typeId} onChange={(v) => v && choose(v)} options={DOCUMENT_TYPES.map((t) => ({ value: t.id, label: t.label }))} title="Document type" testId="type-choose" />
        </Field>
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
              <Input
                type={f.type === 'number' ? 'number' : 'text'}
                min="0"
                value={draft[f.key] ?? ''}
                onChange={(v) => set({ [f.key]: f.type === 'number' ? Math.max(0, parseInt(v || '0', 10)) : v })}
                data-testid={`type-${f.key}`}
              />
            </Field>
          ))}
        <div className="toggle-list">
          {fields
            .filter((f) => f.type === 'bool')
            .map((f) => (
              <Toggle key={f.key} checked={draft[f.key]} onChange={(v) => set({ [f.key]: v })} label={f.label} data-testid={`type-${f.key}`} />
            ))}
        </div>
        {fields
          .filter((f) => f.type === 'textarea')
          .map((f) => (
            <Field key={f.key} label={f.label}>
              <TextArea rows={4} value={draft[f.key] ?? ''} onChange={(v) => set({ [f.key]: v })} data-testid={`type-${f.key}`} />
            </Field>
          ))}
        <button className="btn btn-ghost" onClick={reset}>
          Restore defaults
        </button>
      </div>
      <SaveBar dirty={dirty} onSave={save} />
    </>
  );
}
