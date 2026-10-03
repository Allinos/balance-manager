/** First run after activation: the business shown on every document. */

import { useState } from 'react';
import { Field, Input, Select, TextArea, useUi } from '../components/ui.jsx';
import { STATE_NAMES, isValidGstin, stateFromGstin } from '../lib/states.js';
import { useApp } from '../App.jsx';

export const blankCompany = { name: '', gstin: '', state: '', address: '', phone: '', email: '', bankName: '', accountName: '', accountNumber: '', ifsc: '', upi: '' };

export function CompanyFields({ value, onChange }) {
  const set = (k) => (v) => {
    const next = { ...value, [k]: v };
    if (k === 'gstin') {
      next.gstin = v.toUpperCase();
      const st = stateFromGstin(next.gstin);
      if (st) next.state = st;
    }
    onChange(next);
  };
  return (
    <>
      <Field label="Business name">
        <Input value={value.name} onChange={set('name')} required data-testid="company-name" />
      </Field>
      <Field label="GSTIN (optional)" hint={value.gstin && !isValidGstin(value.gstin) ? 'This does not look like a valid GSTIN' : 'Leave empty if you are not GST registered'}>
        <Input value={value.gstin} onChange={set('gstin')} maxLength={15} autoCapitalize="characters" data-testid="company-gstin" />
      </Field>
      <Field label="State">
        <Select value={value.state} onChange={set('state')} options={[{ value: '', label: 'Choose…' }, ...STATE_NAMES]} data-testid="company-state" />
      </Field>
      <Field label="Address">
        <TextArea value={value.address} onChange={set('address')} rows={2} />
      </Field>
      <div className="grid-2">
        <Field label="Phone">
          <Input type="tel" value={value.phone} onChange={set('phone')} />
        </Field>
        <Field label="Email">
          <Input type="email" value={value.email} onChange={set('email')} />
        </Field>
      </div>
    </>
  );
}

export default function Setup() {
  const { saveCompany, lic } = useApp();
  const { toast } = useUi();
  const [company, setCompany] = useState({ ...blankCompany, name: lic.license?.account?.business || '' });
  const save = async (e) => {
    e.preventDefault();
    if (!company.name.trim()) return;
    await saveCompany({ ...company, name: company.name.trim() });
    toast('Welcome to DocGen!');
  };
  return (
    <form className="gate form" onSubmit={save} data-testid="setup">
      <div>
        <h1>Your business</h1>
        <p className="muted">Printed on your invoices and quotations. You can change it later in Settings.</p>
      </div>
      <CompanyFields value={company} onChange={setCompany} />
      <button className="btn btn-primary btn-block" disabled={!company.name.trim()} data-testid="setup-save">
        Start using DocGen
      </button>
    </form>
  );
}
