import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Field, TextArea, TextInput } from '../../components/Form.jsx';
import { INDIAN_STATES } from '../../config/defaults.js';
import { pickImage, saveCompany } from '../../services/settingsService.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import { SaveBar } from './SettingsParts.jsx';

const EMPTY = {
  name: '', legal_name: '', trade_name: '', address: '', city: '', state: '', pin: '', country: 'India',
  phone: '', email: '', website: '', gstin: '', pan: '', vat_number: '', logo: '', stamp: '', signature: '',
  bank_name: '', account_holder: '', account_number: '', ifsc: '', swift: '', iban: '', branch: '', upi_id: '',
};

export function ImagePicker({ label, value, onChange, hint }) {
  const toast = useToast();
  const choose = async () => {
    try {
      const data = await pickImage();
      if (data) onChange(data);
    } catch (e) {
      toast.error(e.message);
    }
  };
  return (
    <div className="image-picker">
      <span className="field-label">{label}</span>
      <div className="image-picker-box">
        {value ? <img src={value} alt="" /> : <Icon name="image" size={26} />}
      </div>
      <div className="image-picker-actions">
        <button type="button" className="btn btn-sm" onClick={choose}>
          <Icon name="upload" size={15} /> {value ? 'Change' : 'Upload'}
        </button>
        {value && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange('')}>
            Remove
          </button>
        )}
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export default function CompanySettings() {
  const { company, setCompany, settings } = useAppData();
  const toast = useToast();
  const [c, setC] = useState({ ...EMPTY, ...(company || {}) });
  const [dirty, setDirty] = useState(false);
  const set = (patch) => {
    setC((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  const gst = settings.taxSystem === 'GST';

  const save = async () => {
    try {
      const saved = await saveCompany(c);
      setCompany(saved);
      setDirty(false);
      toast.success('Company details saved');
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="settings-section">
      <h2>Company</h2>
      <p className="muted">These details appear on every document.</p>

      <div className="image-row">
        <ImagePicker label="Logo" value={c.logo} onChange={(v) => set({ logo: v })} hint="PNG/JPG, up to 2 MB" />
        <ImagePicker label="Signature" value={c.signature} onChange={(v) => set({ signature: v })} hint="Transparent PNG works best" />
        <ImagePicker label="Stamp / Seal" value={c.stamp} onChange={(v) => set({ stamp: v })} />
      </div>

      <div className="grid-2">
        <Field label="Company name" required>
          <TextInput value={c.name} onChange={(v) => set({ name: v })} />
        </Field>
        <Field label="Legal name">
          <TextInput value={c.legal_name} onChange={(v) => set({ legal_name: v })} />
        </Field>
        <Field label="Trade name">
          <TextInput value={c.trade_name} onChange={(v) => set({ trade_name: v })} />
        </Field>
        <Field label="Phone">
          <TextInput value={c.phone} onChange={(v) => set({ phone: v })} />
        </Field>
        <Field label="Address" className="span-2">
          <TextArea rows={2} value={c.address} onChange={(v) => set({ address: v })} />
        </Field>
        <Field label="City">
          <TextInput value={c.city} onChange={(v) => set({ city: v })} />
        </Field>
        <Field label="State" hint={gst ? 'Used to choose CGST+SGST or IGST automatically' : ''}>
          <TextInput value={c.state} onChange={(v) => set({ state: v })} list="company-states" />
        </Field>
        <Field label="PIN / ZIP code">
          <TextInput value={c.pin} onChange={(v) => set({ pin: v })} />
        </Field>
        <Field label="Country">
          <TextInput value={c.country} onChange={(v) => set({ country: v })} />
        </Field>
        <Field label="Email">
          <TextInput type="email" value={c.email} onChange={(v) => set({ email: v })} />
        </Field>
        <Field label="Website">
          <TextInput value={c.website} onChange={(v) => set({ website: v })} />
        </Field>
        <Field label="GSTIN">
          <TextInput value={c.gstin} onChange={(v) => set({ gstin: v.toUpperCase() })} />
        </Field>
        <Field label="PAN">
          <TextInput value={c.pan} onChange={(v) => set({ pan: v.toUpperCase() })} />
        </Field>
        <Field label="VAT number">
          <TextInput value={c.vat_number} onChange={(v) => set({ vat_number: v })} />
        </Field>
      </div>
      <datalist id="company-states">
        {INDIAN_STATES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <h3>Bank details</h3>
      <div className="grid-2">
        <Field label="Bank name">
          <TextInput value={c.bank_name} onChange={(v) => set({ bank_name: v })} />
        </Field>
        <Field label="Account holder">
          <TextInput value={c.account_holder} onChange={(v) => set({ account_holder: v })} />
        </Field>
        <Field label="Account number">
          <TextInput value={c.account_number} onChange={(v) => set({ account_number: v })} />
        </Field>
        <Field label="IFSC">
          <TextInput value={c.ifsc} onChange={(v) => set({ ifsc: v.toUpperCase() })} />
        </Field>
        <Field label="Branch">
          <TextInput value={c.branch} onChange={(v) => set({ branch: v })} />
        </Field>
        <Field label="UPI ID" hint="Used for the optional UPI payment QR code">
          <TextInput value={c.upi_id} onChange={(v) => set({ upi_id: v })} />
        </Field>
        <Field label="SWIFT">
          <TextInput value={c.swift} onChange={(v) => set({ swift: v.toUpperCase() })} />
        </Field>
        <Field label="IBAN">
          <TextInput value={c.iban} onChange={(v) => set({ iban: v.toUpperCase() })} />
        </Field>
      </div>
      <SaveBar dirty={dirty} onSave={save} />
    </div>
  );
}
