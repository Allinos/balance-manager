import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import SearchSelect from '../../components/SearchSelect.jsx';
import { Field, TextInput } from '../../components/Form.jsx';
import { CURRENCY_PRESETS } from '../../config/defaults.js';
import { BUSINESS_TYPES, TEMPLATES } from '../../config/documentTypes.js';
import { STATE_NAMES, isValidGstin, stateCode, stateFromGstin } from '../../config/states.js';
import { APP_CONFIG } from '../../config/appConfig.js';
import { saveCompany, saveSettings } from '../../services/settingsService.js';
import { loadDemoData } from '../../services/demoService.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import { ImagePicker } from '../settings/CompanySettings.jsx';
import { StylePreview } from '../settings/DocumentSettings.jsx';
import ActivationOptions from '../license/ActivationOptions.jsx';
import BrandName from '../../components/BrandName.jsx';

const STEPS = ['Welcome', 'Company', 'Business', 'Template', 'Activate'];
const stateOptions = STATE_NAMES.map((s) => ({ value: s, label: s, hint: stateCode(s) }));
const currencyOptions = CURRENCY_PRESETS.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}`, hint: c.symbol.trim() }));

/** Five quick steps: welcome → company → business type & currency → template → activate / trial. */
export default function SetupWizard() {
  const { reload } = useAppData();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  const [gstin, setGstin] = useState('');
  const [logo, setLogo] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [business, setBusiness] = useState('trading');
  const [style, setStyle] = useState('tally-pro');
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const styleOverrides = useMemo(
    () => ({ documentStyle: style, baseCurrency: currency, currencies: [{ ...(CURRENCY_PRESETS.find((c) => c.code === currency) || CURRENCY_PRESETS[0]), rate: '1' }] }),
    [style, currency],
  );
  const previewCompany = useMemo(() => ({ name: name.trim() || 'Your Company', state, gstin, logo }), [name, state, gstin, logo]);

  const onGstin = (v) => {
    const g = v.toUpperCase().replace(/\s/g, '');
    setGstin(g);
    const s = stateFromGstin(g);
    if (s && !state) setState(s);
  };

  /** Save company and preferences (everything except `setupComplete`). */
  const persist = async () => {
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
    if (demo) {
      const data = await reload();
      if (data) await loadDemoData({ settings: data.settings, company: data.company, docSettings: data.docSettings });
    }
  };

  const next = async () => {
    if (step === 1 && !name.trim()) {
      toast.error('Please enter your company name.');
      return;
    }
    if (step === 1 && gstin && !isValidGstin(gstin)) {
      toast.error('The GSTIN should be 15 characters, e.g. 27AAPFU0939F1ZV. Leave it empty if you are not registered.');
      return;
    }
    if (step === 3) {
      setBusy(true);
      try {
        await persist();
      } catch (e) {
        toast.error(e.message);
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const complete = async () => {
    setBusy(true);
    try {
      await saveSettings({ setupComplete: true });
      window.location.hash = '#/dashboard';
      await reload();
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="setup">
      <div className={`setup-card ${step === 4 ? 'wide' : ''}`} data-keynav>
        <div className="setup-steps" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <span key={s} className={`setup-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} title={s} />
          ))}
        </div>

        {step === 0 && (
          <div className="setup-body center">
            <img className="setup-logo-img" src={APP_CONFIG.iconUrl} alt="" />
            <h1>
              Welcome to <BrandName />
            </h1>
            <p className="setup-tagline">{APP_CONFIG.tagline}</p>
            <p className="muted">
              Create GST invoices, quotations, orders, challans and receipts in minutes — and keep all your business documents in one
              place. Everything works offline and stays on this computer.
            </p>
            <p className="muted small">Setup takes less than a minute.</p>
          </div>
        )}

        {step === 1 && (
          <div className="setup-body">
            <h2>Your business</h2>
            <p className="muted">Printed at the top of every document. Address and bank details can be added later in Settings.</p>
            <div className="grid-2">
              <Field label="Company name" required className="span-2">
                <TextInput value={name} onChange={setName} autoFocus placeholder="e.g. Sharma Furniture Works" data-testid="setup-company" />
              </Field>
              <Field label="GSTIN (optional)">
                <TextInput value={gstin} onChange={onGstin} maxLength={15} placeholder="27AAPFU0939F1ZV" data-testid="setup-gstin" />
              </Field>
              <Field label="State" hint="Decides CGST+SGST or IGST">
                <SearchSelect value={state} onChange={(v) => setState(v || '')} options={stateOptions} placeholder="Choose state" creatable clearable testId="setup-state" />
              </Field>
            </div>
            <ImagePicker label="Logo (optional)" value={logo} onChange={setLogo} hint="PNG or JPG, up to 2 MB" />
          </div>
        )}

        {step === 2 && (
          <div className="setup-body">
            <h2>What kind of business is it?</h2>
            <p className="muted">DocGen shows the documents you need first. All document types stay available.</p>
            <div className="business-grid">
              {BUSINESS_TYPES.map((b) => (
                <button key={b.id} className={`business-option ${business === b.id ? 'active' : ''}`} onClick={() => setBusiness(b.id)} data-testid={`business-${b.id}`}>
                  <Icon name={b.icon} size={18} />
                  <span>{b.label}</span>
                </button>
              ))}
            </div>
            <Field label="Currency">
              <SearchSelect value={currency} onChange={(v) => v && setCurrency(v)} options={currencyOptions} testId="setup-currency" />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="setup-body">
            <h2>Pick an invoice template</h2>
            <p className="muted">You can change it any time, even for a single document. Your data is never affected.</p>
            <div className="template-options">
              {TEMPLATES.map((t) => (
                <button key={t.id} className={`style-option ${style === t.id ? 'active' : ''}`} onClick={() => setStyle(t.id)} data-testid={`template-${t.id}`}>
                  <strong>{t.label}</strong>
                  <span className="muted small">{t.description}</span>
                </button>
              ))}
            </div>
            <div className="setup-preview">
              <StylePreview overrides={styleOverrides} company={previewCompany} />
            </div>
            <label className="check">
              <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
              <span>Add sample data so I can explore (can be removed later)</span>
            </label>
          </div>
        )}

        {step === 4 && (
          <div className="setup-body">
            <h2>Activate DocGen</h2>
            <ActivationOptions onDone={complete} onSkip={complete} />
          </div>
        )}

        <div className="setup-actions">
          {step > 0 ? (
            <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)} disabled={busy}>
              Back
            </button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 && (
            <button className="btn btn-primary" onClick={next} disabled={busy} data-testid="setup-next" data-keynav-submit>
              {step === 0 ? 'Get started' : busy ? 'Saving…' : 'Continue'} <Icon name="arrowRight" size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
