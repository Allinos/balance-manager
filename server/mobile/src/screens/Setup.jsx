/** First start after activation: company → business type & currency → template (+ sample data). Same choices as the desktop setup. */

import { useMemo, useState } from 'react';
import { CURRENCY_PRESETS } from '@desktop/config/defaults.js';
import { BUSINESS_TYPES, TEMPLATES } from '@desktop/config/documentTypes.js';
import { STATE_NAMES, isValidGstin, stateCode, stateFromGstin } from '@desktop/config/states.js';
import { saveCompany, saveSettings } from '@desktop/services/settingsService.js';
import Icon from '../components/Icon.jsx';
import { Field, Input, Picker, useUi } from '../components/ui.jsx';
import { ImagePicker, SamplePreview } from '../components/docs.jsx';
import { useApp } from '../data.jsx';

const stateOptions = STATE_NAMES.map((s) => ({ value: s, label: s, hint: stateCode(s) }));
const currencyOptions = CURRENCY_PRESETS.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}`, hint: c.symbol.trim() }));
const STEPS = ['Company', 'Business', 'Template'];

export default function Setup() {
  const { lic, reloadData } = useApp();
  const { toast } = useUi();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(lic?.license?.account?.business || '');
  const [gstin, setGstin] = useState('');
  const [state, setState] = useState('');
  const [logo, setLogo] = useState('');
  const [business, setBusiness] = useState('trading');
  const [currency, setCurrency] = useState('INR');
  const [style, setStyle] = useState('tally-pro');
  const [busy, setBusy] = useState(false);
  const overrides = useMemo(() => ({ documentStyle: style, baseCurrency: currency, currencies: [{ ...(CURRENCY_PRESETS.find((c) => c.code === currency) || CURRENCY_PRESETS[0]), rate: '1' }] }), [style, currency]);
  const previewCompany = useMemo(() => ({ name: name.trim() || 'Your Company', state, gstin, logo }), [name, state, gstin, logo]);

  const next = () => {
    if (step === 0 && !name.trim()) return toast('Please enter your company name.', 'bad');
    if (step === 0 && gstin && !isValidGstin(gstin)) return toast('The GSTIN should be 15 characters, e.g. 27AAPFU0939F1ZV. Leave it empty if you are not registered.', 'bad');
    return setStep((s) => s + 1);
  };

  const finish = async () => {
    setBusy(true);
    try {
      const preset = CURRENCY_PRESETS.find((c) => c.code === currency) || CURRENCY_PRESETS[0];
      await saveCompany({ name: name.trim(), state, gstin, logo, currency, country: currency === 'INR' ? 'India' : '' });
      await saveSettings({
        baseCurrency: currency,
        currencies: [{ ...preset, rate: '1' }],
        documentStyle: style,
        businessType: business,
        visibleDocTypes: BUSINESS_TYPES.find((b) => b.id === business)?.types,
        taxSystem: currency === 'INR' ? 'GST' : 'VAT',
        showHsn: currency === 'INR',
      });
      await saveSettings({ setupComplete: true });
      await reloadData();
    } catch (e) {
      toast(e.message, 'bad');
      setBusy(false);
    }
  };

  return (
    <div className="gate setup" data-testid="setup">
      <div className="setup-steps">
        {STEPS.map((s, i) => (
          <span key={s} className={`${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>{s}</span>
        ))}
      </div>
      {step === 0 && (
        <div className="form">
          <div>
            <h1>Your business</h1>
            <p className="muted">Printed at the top of every document. Address and bank details can be added later in Settings.</p>
          </div>
          <Field label="Company name" required>
            <Input value={name} onChange={setName} placeholder="e.g. Sharma Furniture Works" data-testid="company-name" />
          </Field>
          <Field label="GSTIN (optional)" hint="Leave empty if you are not GST registered">
            <Input
              value={gstin}
              onChange={(v) => {
                const g = v.toUpperCase().replace(/\s/g, '');
                setGstin(g);
                const s = stateFromGstin(g);
                if (s && !state) setState(s);
              }}
              maxLength={15}
              placeholder="27AAPFU0939F1ZV"
              data-testid="company-gstin"
            />
          </Field>
          <Field label="State" hint="Decides CGST + SGST or IGST">
            <Picker value={state} onChange={(v) => setState(v || '')} options={stateOptions} placeholder="Choose state" title="State" creatable clearable testId="company-state" />
          </Field>
          <ImagePicker label="Logo (optional)" value={logo} onChange={setLogo} testId="setup-logo" />
        </div>
      )}
      {step === 1 && (
        <div className="form">
          <div>
            <h1>What kind of business is it?</h1>
            <p className="muted">DocGen shows the documents you need first. All document types stay available.</p>
          </div>
          <div className="business-grid">
            {BUSINESS_TYPES.map((b) => (
              <button key={b.id} className={`business-option ${business === b.id ? 'active' : ''}`} onClick={() => setBusiness(b.id)} data-testid={`business-${b.id}`}>
                <Icon name={b.icon} size={18} />
                <span>{b.label}</span>
              </button>
            ))}
          </div>
          <Field label="Currency">
            <Picker value={currency} onChange={(v) => v && setCurrency(v)} options={currencyOptions} title="Currency" testId="setup-currency" />
          </Field>
        </div>
      )}
      {step === 2 && (
        <div className="form">
          <div>
            <h1>Pick an invoice template</h1>
            <p className="muted">You can change it any time, even for a single document.</p>
          </div>
          <div className="template-options">
            {TEMPLATES.map((t) => (
              <button key={t.id} className={`template-option ${style === t.id ? 'active' : ''}`} onClick={() => setStyle(t.id)} data-testid={`template-${t.id}`}>
                <strong>{t.label}</strong>
                <span className="small muted">{t.description}</span>
              </button>
            ))}
          </div>
          <SamplePreview overrides={overrides} company={previewCompany} />
        </div>
      )}
      <div className="setup-actions">
        {step > 0 ? (
          <button className="btn" onClick={() => setStep((s) => s - 1)} disabled={busy}>
            Back
          </button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <button className="btn btn-primary" onClick={next} data-testid="setup-next">
            Continue
          </button>
        ) : (
          <button className="btn btn-primary" onClick={finish} disabled={busy} data-testid="setup-save">
            {busy ? 'Saving…' : 'Start using DocGen'}
          </button>
        )}
      </div>
    </div>
  );
}
