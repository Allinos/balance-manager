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
          <TextInput placeholder="e.g. Sharma Furniture Works" value={c.name} onChange={(v) => set({ name: v })} />
        </Field>
        <Field label="Legal name">
          <TextInput placeholder="Registered name, if different" value={c.legal_name} onChange={(v) => set({ legal_name: v })} />
        </Field>
        <Field label="Trade name">
          <TextInput placeholder="Brand / trade name, if any" value={c.trade_name} onChange={(v) => set({ trade_name: v })} />
        </Field>
        <Field label="Phone">
          <TextInput placeholder="e.g. +91 98450 12345" value={c.phone} onChange={(v) => set({ phone: v })} />
        </Field>
        <Field label="Address" className="span-2">
          <TextArea placeholder="Building, street, area" rows={2} value={c.address} onChange={(v) => set({ address: v })} />
        </Field>
        <Field label="City">
          <TextInput placeholder="e.g. Bengaluru" value={c.city} onChange={(v) => set({ city: v })} />
        </Field>
        <Field label="State" hint={gst ? 'Used to choose CGST+SGST or IGST automatically' : ''}>
          <TextInput placeholder="e.g. Karnataka" value={c.state} onChange={(v) => set({ state: v })} list="company-states" />
        </Field>
        <Field label="PIN / ZIP code">
          <TextInput placeholder="e.g. 560058" value={c.pin} onChange={(v) => set({ pin: v })} />
        </Field>
        <Field label="Country">
          <TextInput placeholder="e.g. India" value={c.country} onChange={(v) => set({ country: v })} />
        </Field>
        <Field label="Email">
          <TextInput placeholder="e.g. sales@yourcompany.in" type="email" value={c.email} onChange={(v) => set({ email: v })} />
        </Field>
        <Field label="Website">
          <TextInput placeholder="e.g. www.yourcompany.in" value={c.website} onChange={(v) => set({ website: v })} />
        </Field>
        <Field label="GSTIN">
          <TextInput placeholder="e.g. 29AAACS1234K1Z9" value={c.gstin} onChange={(v) => set({ gstin: v.toUpperCase() })} />
        </Field>
        <Field label="PAN" help="Your 10-character Permanent Account Number. Printed as “Company's PAN” on GST invoices.">
          <TextInput placeholder="e.g. AAACS1234K" value={c.pan} onChange={(v) => set({ pan: v.toUpperCase() })} />
        </Field>
        <Field label="VAT number">
          <TextInput placeholder="e.g. 100123456700003" value={c.vat_number} onChange={(v) => set({ vat_number: v })} />
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
          <TextInput placeholder="e.g. State Bank of India" value={c.bank_name} onChange={(v) => set({ bank_name: v })} data-testid="company-bank-name" />
        </Field>
        <Field label="Account holder">
          <TextInput placeholder="Name on the bank account" value={c.account_holder} onChange={(v) => set({ account_holder: v })} />
        </Field>
        <Field label="Account number">
          <TextInput placeholder="e.g. 38291045671" value={c.account_number} onChange={(v) => set({ account_number: v })} data-testid="company-account-number" />
        </Field>
        <Field label="IFSC" help="11-character bank branch code, printed with your bank details so customers can pay by NEFT/RTGS.">
          <TextInput placeholder="e.g. SBIN0001234" value={c.ifsc} onChange={(v) => set({ ifsc: v.toUpperCase() })} data-testid="company-ifsc" />
        </Field>
        <Field label="Branch">
          <TextInput placeholder="e.g. Peenya Industrial Area" value={c.branch} onChange={(v) => set({ branch: v })} />
        </Field>
        <Field label="UPI ID" hint="Used for the optional UPI payment QR code">
          <TextInput placeholder="e.g. yourname@sbi" value={c.upi_id} onChange={(v) => set({ upi_id: v })} data-testid="company-upi" />
        </Field>
        <Field label="SWIFT">
          <TextInput placeholder="e.g. SBININBB" value={c.swift} onChange={(v) => set({ swift: v.toUpperCase() })} />
        </Field>
        <Field label="IBAN">
          <TextInput placeholder="For international payments" value={c.iban} onChange={(v) => set({ iban: v.toUpperCase() })} />
        </Field>
      </div>
      <SaveBar dirty={dirty} onSave={save} />
    </div>
  );
}
