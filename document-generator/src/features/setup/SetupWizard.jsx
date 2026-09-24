import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Field, TextInput } from '../../components/Form.jsx';
import { CURRENCY_PRESETS, INDIAN_STATES } from '../../config/defaults.js';
import { saveCompany, saveSettings } from '../../services/settingsService.js';
import { loadDemoData } from '../../services/demoService.js';
import { useAppData } from '../../hooks/useAppData.jsx';
import { useToast } from '../../hooks/useUi.jsx';
import { ImagePicker } from '../settings/CompanySettings.jsx';
import { StylePreview } from '../settings/DocumentSettings.jsx';

const STEPS = ['Welcome', 'Company', 'Logo', 'Currency', 'Style'];

/** Five quick steps: welcome → company name → logo → currency → document style. */
export default function SetupWizard() {
  const { reload } = useAppData();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  const [logo, setLogo] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [style, setStyle] = useState('zoho');
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const styleOverrides = useMemo(
    () => ({ documentStyle: style, baseCurrency: currency, currencies: [{ ...(CURRENCY_PRESETS.find((c) => c.code === currency) || CURRENCY_PRESETS[0]), rate: '1' }] }),
    [style, currency],
  );
  const previewCompany = useMemo(() => ({ name: name.trim() || 'Your Company', state, logo }), [name, state, logo]);

  const next = () => {
    if (step === 1 && !name.trim()) {
      toast.error('Please enter your company name.');
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const finish = async () => {
    setBusy(true);
    try {
      const preset = CURRENCY_PRESETS.find((c) => c.code === currency) || CURRENCY_PRESETS[0];
      await saveCompany({ name: name.trim(), state, logo, currency, country: currency === 'INR' ? 'India' : '' });
      const values = {
        baseCurrency: currency,
        currencies: [{ ...preset, rate: '1' }],
        documentStyle: style,
        taxSystem: currency === 'INR' ? 'GST' : 'VAT',
        showHsn: currency === 'INR',
      };
      await saveSettings(values);
      if (demo) {
        const data = await reload();
        if (data) await loadDemoData({ settings: data.settings, company: data.company, docSettings: data.docSettings });
      }
      await saveSettings({ setupComplete: true });
      window.location.hash = '#/documents';
      await reload();
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="setup">
      <div className="setup-card">
        <div className="setup-steps" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <span key={s} className={`setup-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} title={s} />
          ))}
        </div>

        {step === 0 && (
          <div className="setup-body center">
            <div className="setup-logo">
              <Icon name="documents" size={34} />
            </div>
            <h1>Welcome to DocGen</h1>
            <p className="muted">
              Create professional invoices, quotations, orders, challans and receipts in minutes. Everything works offline and
              stays on this computer.
            </p>
            <p className="muted small">This quick setup takes less than a minute.</p>
          </div>
        )}

        {step === 1 && (
          <div className="setup-body">
            <h2>What is your company called?</h2>
            <p className="muted">It appears at the top of every document. You can add address, GSTIN and bank details later.</p>
            <Field label="Company name" required>
              <TextInput value={name} onChange={setName} autoFocus placeholder="e.g. Sharma Furniture Works" onKeyDown={(e) => e.key === 'Enter' && next()} data-testid="setup-company" />
            </Field>
            <Field label="State (optional)" hint="Helps DocGen choose CGST+SGST or IGST automatically">
              <TextInput value={state} onChange={setState} list="setup-states" />
            </Field>
            <datalist id="setup-states">
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        )}

        {step === 2 && (
          <div className="setup-body">
            <h2>Add your logo</h2>
            <p className="muted">Optional — you can skip this and add it later in Settings.</p>
            <ImagePicker label="Logo" value={logo} onChange={setLogo} hint="PNG or JPG, up to 2 MB" />
          </div>
        )}

        {step === 3 && (
          <div className="setup-body">
            <h2>Choose your currency</h2>
            <div className="currency-grid">
              {CURRENCY_PRESETS.slice(0, 9).map((c) => (
                <button key={c.code} className={`currency-option ${currency === c.code ? 'active' : ''}`} onClick={() => setCurrency(c.code)}>
                  <strong>{c.symbol.trim()}</strong>
                  <span>{c.code}</span>
                  <small>{c.name}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="setup-body">
            <h2>Pick a document style</h2>
            <div className="style-options">
              <button className={`style-option ${style === 'tally' ? 'active' : ''}`} onClick={() => setStyle('tally')}>
                <strong>Tally style</strong>
                <span className="muted small">Compact, boxed, traditional</span>
              </button>
              <button className={`style-option ${style === 'zoho' ? 'active' : ''}`} onClick={() => setStyle('zoho')}>
                <strong>Zoho style</strong>
                <span className="muted small">Modern, clean, spacious</span>
              </button>
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

        <div className="setup-actions">
          {step > 0 ? (
            <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)} disabled={busy}>
              Back
            </button>
          ) : (
            <span />
          )}
          {step === 2 && !logo && (
            <button className="btn btn-ghost" onClick={next}>
              Skip
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={next} data-testid="setup-next">
              {step === 0 ? 'Get started' : 'Continue'} <Icon name="arrowRight" size={16} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={finish} disabled={busy} data-testid="setup-finish">
              {busy ? 'Setting up…' : 'Start Creating Documents'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
