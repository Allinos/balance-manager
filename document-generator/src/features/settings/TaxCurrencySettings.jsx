import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Field, NumberInput, Segmented, Select, TextInput } from '../../components/Form.jsx';
import { CURRENCY_PRESETS } from '../../config/defaults.js';
import SearchSelect from '../../components/SearchSelect.jsx';
import { isValidRate, rateValue, taxRateOptions } from '../../config/taxRates.js';
import { DOCUMENT_TYPES } from '../../config/documentTypes.js';
import { listSequences, previewNumber, saveSequence } from '../../services/settingsService.js';
import { todayISO } from '../../utils/dates.js';
import { dec } from '../../utils/decimal.js';
import { useToast } from '../../hooks/useUi.jsx';
import { SaveBar, useSettingsDraft } from './SettingsParts.jsx';

export function TaxSettings() {
  const { draft, set, dirty, save } = useSettingsDraft(['taxSystem', 'taxLabel', 'taxRates', 'defaultTaxRate']);
  const [newRate, setNewRate] = useState('');

  const addRate = () => {
    const r = newRate.trim();
    if (!r || dec(r) < 0n || draft.taxRates.includes(r)) return;
    set({ taxRates: [...draft.taxRates, r].sort((a, b) => (dec(a) < dec(b) ? -1 : 1)) });
    setNewRate('');
  };

  return (
    <div className="settings-section">
      <h2>Tax</h2>
      <Field label="Tax system">
        <Segmented
          value={draft.taxSystem}
          onChange={(v) => set({ taxSystem: v })}
          options={[
            { value: 'GST', label: 'Indian GST (CGST/SGST/IGST)' },
            { value: 'VAT', label: 'VAT / Sales tax' },
            { value: 'NONE', label: 'No tax' },
          ]}
        />
      </Field>
      {draft.taxSystem === 'GST' && (
        <p className="muted small">
          Same-state sales split the rate into CGST + SGST (e.g. 18% → 9% + 9%). Other-state sales use IGST. DocGen picks
          this automatically from your company state and the customer&apos;s place of supply.
        </p>
      )}
      {draft.taxSystem === 'VAT' && (
        <Field label="Tax name shown on documents">
          <TextInput value={draft.taxLabel} onChange={(v) => set({ taxLabel: v })} placeholder="VAT" />
        </Field>
      )}
      {draft.taxSystem !== 'NONE' && (
        <>
          <Field label="Tax rates (%)">
            <div className="chip-editor">
              {draft.taxRates.map((r) => (
                <span className="chip" key={r}>
                  {r}%
                  <button
                    type="button"
                    aria-label={`Remove ${r}%`}
                    onClick={() => set({ taxRates: draft.taxRates.filter((x) => x !== r) })}
                  >
                    <Icon name="x" size={13} />
                  </button>
                </span>
              ))}
              <NumberInput value={newRate} onChange={setNewRate} placeholder="Add rate" onKeyDown={(e) => e.key === 'Enter' && addRate()} />
              <button type="button" className="btn btn-sm" onClick={addRate}>
                Add
              </button>
            </div>
          </Field>
          <Field label="Default tax rate for new items">
            <SearchSelect
              value={rateValue(draft.defaultTaxRate)}
              onChange={(v) => v !== '' && isValidRate(v) && set({ defaultTaxRate: v })}
              options={taxRateOptions({ ...draft, taxSystem: draft.taxSystem }, draft.defaultTaxRate)}
              creatable
              testId="default-tax-rate"
            />
          </Field>
        </>
      )}
      <SaveBar dirty={dirty} onSave={save} />
    </div>
  );
}

export function CurrencySettings() {
  const { draft, set, dirty, save } = useSettingsDraft(['baseCurrency', 'currencies']);
  const [preset, setPreset] = useState('');
  const available = CURRENCY_PRESETS.filter((p) => !draft.currencies.some((c) => c.code === p.code));

  const update = (code, patch) => set({ currencies: draft.currencies.map((c) => (c.code === code ? { ...c, ...patch } : c)) });
  const add = () => {
    const p = CURRENCY_PRESETS.find((x) => x.code === preset);
    if (!p) return;
    set({ currencies: [...draft.currencies, { ...p, rate: '1' }] });
    setPreset('');
  };

  return (
    <div className="settings-section">
      <h2>Currency</h2>
      <p className="muted">
        Exchange rates are entered by you (no internet needed). Each document stores the rate used when it was created.
      </p>
      <Field label="Base currency">
        <Select
          value={draft.baseCurrency}
          onChange={(code) => {
            const list = draft.currencies.some((c) => c.code === code)
              ? draft.currencies
              : [...draft.currencies, { ...CURRENCY_PRESETS.find((p) => p.code === code), rate: '1' }];
            set({ baseCurrency: code, currencies: list.map((c) => (c.code === code ? { ...c, rate: '1' } : c)) });
          }}
          options={CURRENCY_PRESETS.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
        />
      </Field>
      <table className="table compact">
        <thead>
          <tr>
            <th>Code</th>
            <th>Symbol</th>
            <th>Decimals</th>
            <th>Rate (1 unit = ? {draft.baseCurrency})</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {draft.currencies.map((c) => (
            <tr key={c.code}>
              <td>
                <strong>{c.code}</strong>
              </td>
              <td>
                <input className="input" value={c.symbol} onChange={(e) => update(c.code, { symbol: e.target.value })} />
              </td>
              <td>
                <select className="input" value={c.decimals} onChange={(e) => update(c.code, { decimals: Number(e.target.value) })}>
                  {[0, 1, 2, 3].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {c.code === draft.baseCurrency ? (
                  <span className="muted">1 (base)</span>
                ) : (
                  <NumberInput value={c.rate} onChange={(v) => update(c.code, { rate: v })} />
                )}
              </td>
              <td>
                {c.code !== draft.baseCurrency && (
                  <button className="icon-btn danger" onClick={() => set({ currencies: draft.currencies.filter((x) => x.code !== c.code) })} aria-label={`Remove ${c.code}`}>
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {available.length > 0 && (
        <div className="inline-form">
          <select className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="">Add a currency…</option>
            {available.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
          <button className="btn" onClick={add} disabled={!preset}>
            <Icon name="plus" /> Add
          </button>
        </div>
      )}
      <SaveBar dirty={dirty} onSave={save} />
    </div>
  );
}

const FORMATS = [
  { value: '{PREFIX}-{NUM}', label: 'INV-00001' },
  { value: '{PREFIX}/{FY}/{NUM}', label: 'INV/2026-27/0001' },
  { value: '{PREFIX}/{FYS}/{NUM}', label: 'INV/26-27/0001' },
  { value: '{PREFIX}-{YYYY}-{NUM}', label: 'INV-2026-0001' },
  { value: '{PREFIX}{NUM}', label: 'INV00001' },
];

function SequenceRow({ seq, onSaved }) {
  const toast = useToast();
  const [s, setS] = useState(seq);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState('');
  const set = (patch) => {
    setS((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  const type = DOCUMENT_TYPES.find((t) => t.id === s.doc_type);

  useEffect(() => {
    if (!dirty) {
      previewNumber(s.doc_type, s.prefix, todayISO()).then(setPreview).catch(() => setPreview(''));
    }
  }, [dirty, s.doc_type, s.prefix]);

  const localPreview = s.format
    .replace('{PREFIX}', s.prefix)
    .replace('{FYS}', '26-27')
    .replace('{FY}', '2026-27')
    .replace('{YYYY}', String(new Date().getFullYear()))
    .replace('{NUM}', String(s.next_number).padStart(Number(s.padding) || 1, '0'));

  const save = async () => {
    try {
      await saveSequence({ ...s, next_number: Number(s.next_number), start_number: Number(s.start_number), padding: Number(s.padding), reset_yearly: !!s.reset_yearly });
      setDirty(false);
      toast.success(`${type?.short || s.doc_type} numbering saved`);
      onSaved();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <tr>
      <td>
        <strong>{type?.short || s.doc_type}</strong>
      </td>
      <td>
        <input className="input" value={s.prefix} onChange={(e) => set({ prefix: e.target.value.replace(/\s/g, '') })} maxLength={20} />
      </td>
      <td>
        <select
          className="input"
          value={FORMATS.some((f) => f.value === s.format) ? s.format : 'custom'}
          onChange={(e) => e.target.value !== 'custom' && set({ format: e.target.value, padding: e.target.value.includes('FY') || e.target.value.includes('YYYY') ? 4 : 5 })}
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
          {!FORMATS.some((f) => f.value === s.format) && <option value="custom">{s.format}</option>}
        </select>
      </td>
      <td>
        <input className="input num" type="number" min="1" value={s.next_number} onChange={(e) => set({ next_number: e.target.value })} />
      </td>
      <td>
        <input className="input num" type="number" min="1" max="12" value={s.padding} onChange={(e) => set({ padding: e.target.value })} />
      </td>
      <td className="center">
        <input type="checkbox" checked={!!s.reset_yearly} onChange={(e) => set({ reset_yearly: e.target.checked })} title="Restart numbering every financial year" />
      </td>
      <td className="mono">{dirty ? localPreview : preview}</td>
      <td>
        <button className="btn btn-sm btn-primary" disabled={!dirty} onClick={save}>
          Save
        </button>
      </td>
    </tr>
  );
}

export function NumberingSettings() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const { draft, set, dirty, save } = useSettingsDraft(['fiscalYearStartMonth']);

  const load = () =>
    listSequences()
      .then((list) => {
        const known = DOCUMENT_TYPES.map((t) => list.find((s) => s.doc_type === t.id) || { doc_type: t.id, prefix: t.prefix, next_number: 1, start_number: 1, padding: 5, format: '{PREFIX}-{NUM}', reset_yearly: 0 });
        setRows(known.map((s) => ({ ...s, reset_yearly: !!s.reset_yearly })));
      })
      .catch((e) => toast.error(e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="settings-section">
      <h2>Numbering</h2>
      <p className="muted">
        Numbers are assigned automatically when a document is first saved. &quot;Next&quot; is the number the next document will get.
      </p>
      <div className="inline-form">
        <Field label="Financial year starts in" help="Numbering can restart every financial year (April in India), e.g. INV/2026-27/0001.">
          <Select value={String(draft.fiscalYearStartMonth)} onChange={(v) => set({ fiscalYearStartMonth: Number(v) })} options={months.map((m, i) => ({ value: String(i + 1), label: m }))} />
        </Field>
        {dirty && (
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        )}
      </div>
      {!rows ? null : (
        <div className="table-scroll">
          <table className="table compact">
            <thead>
              <tr>
                <th>Document</th>
                <th>Prefix</th>
                <th>Format</th>
                <th>Next</th>
                <th>Digits</th>
                <th title="Restart every financial year">Yearly reset</th>
                <th>Next number</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <SequenceRow key={s.doc_type} seq={s} onSaved={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
