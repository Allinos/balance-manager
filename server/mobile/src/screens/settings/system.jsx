/** Settings → Tax, Currency, Numbering, Units, General, License, Backup, Help, About. */

import { useEffect, useState } from 'react';
import { CURRENCY_PRESETS } from '@desktop/config/defaults.js';
import { DOCUMENT_TYPES } from '@desktop/config/documentTypes.js';
import { DEFAULT_UNITS, PRODUCT_UNITS, SERVICE_UNITS } from '@desktop/config/units.js';
import { isValidRate, rateValue, taxRateOptions } from '@desktop/config/taxRates.js';
import { listSequences, previewNumber, saveSequence } from '@desktop/services/settingsService.js';
import { exportBackup, restoreBackup } from '@desktop/services/systemService.js';
import { loadDemoData, removeDemoData } from '@desktop/services/demoService.js';
import { DATE_FORMATS, todayISO } from '@desktop/utils/dates.js';
import { dec } from '@desktop/utils/decimal.js';
import Icon from '../../components/Icon.jsx';
import { Field, Input, NumberInput, Picker, Segmented, Select, Toggle, useUi } from '../../components/ui.jsx';
import { APP_VERSION, signOut } from '../../lib/license.js';
import { shortDate, useApp, useDocContext } from '../../data.jsx';
import { SaveBar, useSettingsDraft } from './parts.jsx';

export function TaxSection() {
  const { draft, set, dirty, save } = useSettingsDraft(['taxSystem', 'taxLabel', 'taxRates', 'defaultTaxRate']);
  const [newRate, setNewRate] = useState('');
  const addRate = () => {
    const r = newRate.trim();
    if (!r || dec(r) < 0n || draft.taxRates.includes(r)) return;
    set({ taxRates: [...draft.taxRates, r].sort((a, b) => (dec(a) < dec(b) ? -1 : 1)) });
    setNewRate('');
  };
  return (
    <>
      <div className="page form" data-testid="settings-tax">
        <Field label="Tax system">
          <Segmented
            value={draft.taxSystem}
            onChange={(v) => set({ taxSystem: v })}
            options={[
              { value: 'GST', label: 'GST' },
              { value: 'VAT', label: 'VAT / Sales tax' },
              { value: 'NONE', label: 'No tax' },
            ]}
            testId="tax-system"
          />
        </Field>
        {draft.taxSystem === 'GST' && (
          <p className="small muted" style={{ margin: 0 }}>
            Same-state sales split the rate into CGST + SGST (18% → 9% + 9%); other-state sales use IGST. DocGen chooses this from your state and the place of supply.
          </p>
        )}
        {draft.taxSystem === 'VAT' && (
          <Field label="Tax name shown on documents">
            <Input value={draft.taxLabel} onChange={(v) => set({ taxLabel: v })} placeholder="VAT" />
          </Field>
        )}
        {draft.taxSystem !== 'NONE' && (
          <>
            <Field label="Tax rates (%)">
              <div className="chip-editor">
                {draft.taxRates.map((r) => (
                  <span className="chip static" key={r}>
                    {r}%
                    <button type="button" aria-label={`Remove ${r}%`} onClick={() => set({ taxRates: draft.taxRates.filter((x) => x !== r) })}>
                      <Icon name="x" size={13} />
                    </button>
                  </span>
                ))}
              </div>
            </Field>
            <div className="row">
              <NumberInput value={newRate} onChange={setNewRate} placeholder="Add rate, e.g. 0.25" data-testid="tax-rate-new" />
              <button type="button" className="btn" onClick={addRate} data-testid="tax-rate-add">
                Add
              </button>
            </div>
            <Field label="Default tax rate for new items">
              <Picker value={rateValue(draft.defaultTaxRate)} onChange={(v) => v !== '' && isValidRate(v) && set({ defaultTaxRate: v })} options={taxRateOptions(draft, draft.defaultTaxRate)} creatable title="Default rate" testId="default-tax-rate" />
            </Field>
          </>
        )}
      </div>
      <SaveBar dirty={dirty} onSave={save} />
    </>
  );
}

export function CurrencySection() {
  const { draft, set, dirty, save } = useSettingsDraft(['baseCurrency', 'currencies']);
  const [preset, setPreset] = useState('');
  const available = CURRENCY_PRESETS.filter((p) => !draft.currencies.some((c) => c.code === p.code));
  const update = (code, patch) => set({ currencies: draft.currencies.map((c) => (c.code === code ? { ...c, ...patch } : c)) });
  return (
    <>
      <div className="page form" data-testid="settings-currency">
        <p className="small muted" style={{ margin: 0 }}>
          Exchange rates are entered by you (no internet needed). Each document keeps the rate used when it was created.
        </p>
        <Field label="Base currency">
          <Select
            value={draft.baseCurrency}
            onChange={(code) => {
              const list = draft.currencies.some((c) => c.code === code) ? draft.currencies : [...draft.currencies, { ...CURRENCY_PRESETS.find((p) => p.code === code), rate: '1' }];
              set({ baseCurrency: code, currencies: list.map((c) => (c.code === code ? { ...c, rate: '1' } : c)) });
            }}
            options={CURRENCY_PRESETS.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
          />
        </Field>
        {draft.currencies.map((c) => (
          <div key={c.code} className="card mini form" data-testid={`currency-${c.code}`}>
            <div className="card-title">
              <h2>{c.code}</h2>
              {c.code !== draft.baseCurrency ? (
                <button className="icon-btn sm danger" onClick={() => set({ currencies: draft.currencies.filter((x) => x.code !== c.code) })} aria-label={`Remove ${c.code}`}>
                  <Icon name="trash" size={18} />
                </button>
              ) : (
                <span className="pill">Base</span>
              )}
            </div>
            <div className="grid-3">
              <Field label="Symbol">
                <Input value={c.symbol} onChange={(v) => update(c.code, { symbol: v })} />
              </Field>
              <Field label="Decimals">
                <Select value={String(c.decimals)} onChange={(v) => update(c.code, { decimals: Number(v) })} options={['0', '1', '2', '3']} />
              </Field>
              <Field label={`Rate (${draft.baseCurrency})`}>{c.code === draft.baseCurrency ? <span className="muted">1</span> : <NumberInput value={c.rate} onChange={(v) => update(c.code, { rate: v })} />}</Field>
            </div>
          </div>
        ))}
        {available.length > 0 && (
          <div className="row">
            <select className="input" value={preset} onChange={(e) => setPreset(e.target.value)} data-testid="currency-add-choose">
              <option value="">Add a currency…</option>
              {available.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
            <button
              className="btn"
              disabled={!preset}
              onClick={() => {
                set({ currencies: [...draft.currencies, { ...CURRENCY_PRESETS.find((x) => x.code === preset), rate: '1' }] });
                setPreset('');
              }}
              data-testid="currency-add"
            >
              Add
            </button>
          </div>
        )}
      </div>
      <SaveBar dirty={dirty} onSave={save} />
    </>
  );
}

const FORMATS = [
  { value: '{PREFIX}-{NUM}', label: 'INV-00001' },
  { value: '{PREFIX}/{FY}/{NUM}', label: 'INV/2026-27/0001' },
  { value: '{PREFIX}/{FYS}/{NUM}', label: 'INV/26-27/0001' },
  { value: '{PREFIX}-{YYYY}-{NUM}', label: 'INV-2026-0001' },
  { value: '{PREFIX}{NUM}', label: 'INV00001' },
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function SequenceCard({ seq, onSaved }) {
  const { toast } = useUi();
  const [s, setS] = useState(seq);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState('');
  const type = DOCUMENT_TYPES.find((t) => t.id === s.doc_type);
  const set = (patch) => {
    setS((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  useEffect(() => {
    if (!dirty) previewNumber(s.doc_type, s.prefix, todayISO()).then(setPreview).catch(() => setPreview(''));
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
      toast(`${type?.short || s.doc_type} numbering saved`);
      onSaved();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  return (
    <div className="card mini form" data-testid={`seq-${s.doc_type}`}>
      <div className="card-title">
        <h2>{type?.short || s.doc_type}</h2>
        <span className="mono small" data-testid={`seq-preview-${s.doc_type}`}>
          {dirty ? localPreview : preview}
        </span>
      </div>
      <div className="grid-2">
        <Field label="Prefix">
          <Input value={s.prefix} onChange={(v) => set({ prefix: v.replace(/\s/g, '') })} maxLength={20} data-testid={`seq-prefix-${s.doc_type}`} />
        </Field>
        <Field label="Format">
          <select
            className="input"
            value={FORMATS.some((f) => f.value === s.format) ? s.format : 'custom'}
            onChange={(e) => e.target.value !== 'custom' && set({ format: e.target.value, padding: e.target.value.includes('FY') || e.target.value.includes('YYYY') ? 4 : 5 })}
            data-testid={`seq-format-${s.doc_type}`}
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
            {!FORMATS.some((f) => f.value === s.format) && <option value="custom">{s.format}</option>}
          </select>
        </Field>
        <Field label="Next number">
          <input className="input" type="number" min="1" value={s.next_number} onChange={(e) => set({ next_number: e.target.value })} data-testid={`seq-next-${s.doc_type}`} />
        </Field>
        <Field label="Digits">
          <input className="input" type="number" min="1" max="12" value={s.padding} onChange={(e) => set({ padding: e.target.value })} />
        </Field>
      </div>
      <Toggle checked={!!s.reset_yearly} onChange={(v) => set({ reset_yearly: v })} label="Restart every financial year" />
      {dirty && (
        <button className="btn btn-primary" onClick={save} data-testid={`seq-save-${s.doc_type}`}>
          Save
        </button>
      )}
    </div>
  );
}

export function NumberingSection() {
  const { toast } = useUi();
  const [rows, setRows] = useState(null);
  const { draft, set, dirty, save } = useSettingsDraft(['fiscalYearStartMonth']);
  const load = () =>
    listSequences()
      .then((list) => {
        const known = DOCUMENT_TYPES.map(
          (t) => list.find((s) => s.doc_type === t.id) || { doc_type: t.id, prefix: t.prefix, next_number: 1, start_number: 1, padding: 5, format: '{PREFIX}-{NUM}', reset_yearly: 0 },
        );
        setRows(known.map((s) => ({ ...s, reset_yearly: !!s.reset_yearly })));
      })
      .catch((e) => toast(e.message, 'bad'));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="page form" data-testid="settings-numbering">
      <p className="small muted" style={{ margin: 0 }}>
        Numbers are assigned when a document is first saved. “Next number” is what the next document gets.
      </p>
      <div className="row">
        <Field label="Financial year starts in" className="spacer">
          <Select value={String(draft.fiscalYearStartMonth)} onChange={(v) => set({ fiscalYearStartMonth: Number(v) })} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
        </Field>
        {dirty && (
          <button className="btn btn-primary align-end" onClick={save}>
            Save
          </button>
        )}
      </div>
      {rows?.map((s) => (
        <SequenceCard key={s.doc_type} seq={s} onSaved={load} />
      ))}
    </div>
  );
}

export function UnitsSection() {
  const { draft, set, dirty, save } = useSettingsDraft(['units']);
  const [unit, setUnit] = useState('');
  const units = draft.units?.length ? draft.units : DEFAULT_UNITS;
  const custom = units.filter((u) => !DEFAULT_UNITS.includes(u));
  const add = (e) => {
    e.preventDefault();
    const u = unit.trim().slice(0, 20);
    if (!u) return;
    if (!units.some((x) => x.toLowerCase() === u.toLowerCase())) set({ units: [...units, u] });
    setUnit('');
  };
  return (
    <>
      <div className="page form" data-testid="settings-units">
        <form className="row" onSubmit={add}>
          <input className="input" placeholder="New unit, e.g. Crate" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} data-testid="unit-new" />
          <button className="btn" disabled={!unit.trim()} data-testid="unit-add">
            Add
          </button>
        </form>
        <div className="section-label">Your units</div>
        {custom.length ? (
          <div className="chip-editor" data-testid="custom-units">
            {custom.map((u) => (
              <span key={u} className="chip static">
                {u}
                <button type="button" onClick={() => set({ units: units.filter((x) => x !== u) })} aria-label={`Remove ${u}`}>
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="small muted">None yet.</p>
        )}
        <div className="section-label">Standard units</div>
        <p className="small">
          <strong>Products: </strong>
          <span className="muted">{PRODUCT_UNITS.join(', ')}</span>
        </p>
        <p className="small">
          <strong>Services: </strong>
          <span className="muted">{SERVICE_UNITS.join(', ')}</span>
        </p>
      </div>
      <SaveBar dirty={dirty} onSave={save} />
    </>
  );
}

export function GeneralSection() {
  const { draft, set, dirty, save } = useSettingsDraft(['dateFormat']);
  const ctx = useDocContext();
  const { toast, confirm } = useUi();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="page form" data-testid="settings-general">
        <Field label="Date format">
          <Select value={draft.dateFormat} onChange={(v) => set({ dateFormat: v })} options={DATE_FORMATS} data-testid="date-format" />
        </Field>
        <div className="section-label">Sample data</div>
        <p className="small muted" style={{ margin: 0 }}>
          Add a sample customer, products, an invoice and a quotation to explore DocGen. Sample records are marked and can be removed at any time.
        </p>
        <div className="grid-2">
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await loadDemoData(ctx);
                toast('Sample data added. Look for items marked "Sample".');
              } catch (e) {
                toast(e.message, 'bad');
              } finally {
                setBusy(false);
              }
            }}
            data-testid="demo-load"
          >
            <Icon name="sparkle" size={18} /> Load sample
          </button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              if (!(await confirm({ title: 'Remove sample data?', message: 'All sample documents, products and customers are deleted. Your own data is not affected.', confirmLabel: 'Remove sample data', danger: true }))) return;
              await removeDemoData();
              toast('Sample data removed');
            }}
            data-testid="demo-remove"
          >
            <Icon name="trash" size={18} /> Remove sample
          </button>
        </div>
      </div>
      <SaveBar dirty={dirty} onSave={save} />
    </>
  );
}

export function LicenseSection() {
  const { lic, check, reload } = useApp();
  const { toast, confirm } = useUi();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const l = lic.license;
  return (
    <div className="page">
      <div className="card" data-testid="license-card">
        <div className="card-title">
          <h2>DocGen license</h2>
          <span className="license-chip">
            <Icon name="shield" size={14} /> Active
          </span>
        </div>
        <dl className="kv">
          <dt>License key</dt>
          <dd className="mono" onClick={() => setShow(!show)} data-testid="license-key-shown">
            {show ? l.key : `${l.key.slice(0, 4)}-••••-••••`}
          </dd>
          <dt>Product</dt>
          <dd>{l.product}</dd>
          {l.account && (
            <>
              <dt>Account</dt>
              <dd>{l.account.email}</dd>
            </>
          )}
          <dt>Start date</dt>
          <dd>{shortDate(l.startedAt)}</dd>
          <dt>Expiry date</dt>
          <dd data-testid="license-expiry">{l.expiresAt ? shortDate(l.expiresAt) : 'Lifetime'}</dd>
          {lic.daysLeft !== null && (
            <>
              <dt>Remaining</dt>
              <dd>{lic.daysLeft} days</dd>
            </>
          )}
          <dt>This device</dt>
          <dd>{l.deviceName}</dd>
          <dt>Last checked</dt>
          <dd>{l.lastCheckAt ? new Date(l.lastCheckAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</dd>
        </dl>
        <div className="grid-2" style={{ marginTop: 14 }}>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await check(true);
                toast(r.state === 'active' ? 'License is up to date' : 'License changed', r.state === 'active' ? 'good' : 'bad');
              } catch (e) {
                toast(e.message, 'bad');
              } finally {
                setBusy(false);
              }
            }}
            data-testid="license-check"
          >
            <Icon name="refresh" size={18} /> Check now
          </button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              const ok = await confirm({
                title: 'Sign out of this phone?',
                message: 'This phone is removed from your license so it can be used on another one. Your documents stay on this phone.',
                confirmLabel: 'Sign out',
                danger: true,
              });
              if (!ok) return;
              await signOut();
              await reload();
            }}
            data-testid="license-signout"
          >
            <Icon name="logout" size={18} /> Sign out
          </button>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Manage devices and extend your license in your <a href="/account">DocGen account</a>.
        </p>
      </div>
    </div>
  );
}

export function BackupSection() {
  const { reloadData } = useApp();
  const { toast, confirm } = useUi();
  const [armed, setArmed] = useState(false);
  return (
    <div className="page form" data-testid="settings-backup">
      <p className="small muted" style={{ margin: 0 }}>
        Your documents are stored only on this phone. Save a backup regularly (e.g. to Google Drive) — it contains documents, files, products, customers,
        settings, logo and signature.
      </p>
      <div className="card form">
        <strong>Save a backup</strong>
        <button
          className="btn btn-primary"
          onClick={async () => {
            try {
              toast(`Backup saved to ${await exportBackup()}`);
            } catch (e) {
              toast(e.message, 'bad');
            }
          }}
          data-testid="backup"
        >
          <Icon name="download" size={18} /> Save backup file
        </button>
      </div>
      <div className="card form">
        <strong>Restore a backup</strong>
        <span className="small muted">Replaces everything on this phone with the backup. Your current data is kept as a safety copy first.</span>
        {armed ? (
          <button
            className="btn btn-danger-solid"
            onClick={async () => {
              try {
                const r = await restoreBackup();
                if (r) {
                  toast('Backup restored');
                  setArmed(false);
                  await reloadData();
                }
              } catch (e) {
                toast(e.message, 'bad');
              }
            }}
            data-testid="restore-choose"
          >
            <Icon name="upload" size={18} /> Choose backup file
          </button>
        ) : (
          <button
            className="btn"
            onClick={async () => {
              if (await confirm({ title: 'Restore from a backup?', message: 'All documents, files, products, customers and settings on this phone are replaced by the backup.', confirmLabel: 'Continue', danger: true })) setArmed(true);
            }}
            data-testid="restore"
          >
            <Icon name="upload" size={18} /> Restore backup
          </button>
        )}
      </div>
    </div>
  );
}

const GUIDES = [
  ['Create your first invoice', ['On the Dashboard tap + on the Invoices card (or the round + button).', 'Type the customer name or pick a saved one — "Save this customer" keeps it for next time.', 'Add items: pick a saved product or type name, quantity, unit and rate. GST is calculated automatically.', 'Tap Save. The number comes from your series (Settings → Numbering).', 'Tap Print / PDF and choose "Save as PDF" to send it on WhatsApp or email.']],
  ['GST invoice checklist', ['Enter your GSTIN, state and PAN in Settings → Company.', "Enter the customer's GSTIN — the state is filled in from it.", 'Place of supply decides CGST + SGST (same state) or IGST (other state).', 'Add HSN / SAC codes to products — the HSN summary is printed on the invoice.', 'The Tally Professional template has the complete GST layout.']],
  ['Documents & files', ['Documents lists everything you created. Search by number, customer or product.', 'Tap the status of a document to change it.', 'The paperclip adds files (PDF, photos, Excel…) such as supplier bills — they appear under Files.', 'Deleted items can be restored from "Deleted".']],
  ['Templates', ['Settings → Documents: the default template (Tally Professional, Tally Standard, Modern, Simple).', 'Settings → Document Types: a different template for one type.', 'On a document, the Template switch changes only that document.']],
  ['Cancel an invoice correctly', ['Open the invoice → ⋯ → Cancel invoice, and give a reason.', 'It is kept, marked CANCELLED on screen and in print, and the change is recorded in its history.', 'The number stays used so your series has no gaps.']],
  ['Back up your data', ['Everything is stored only on this phone.', 'Settings → Backup → Save backup file, then keep the file in Google Drive or send it to yourself.', 'On a new phone: install DocGen Mobile, activate, then Restore backup.']],
];
const FAQ = [
  ['Does DocGen Mobile need the internet?', 'No. It works offline. The internet is used only to activate and to check your license once a day when available.'],
  ['Is my business data uploaded?', 'Never. Documents, customers, products and files stay on this phone.'],
  ['How do I get a PDF?', 'Open the document → Print / PDF → choose "Save as PDF" as the printer.'],
  ['Can I edit an issued invoice?', 'Yes, DocGen warns you first. For correct accounts, prefer cancelling and re-issuing, or a credit / debit note.'],
];

export function HelpSection() {
  const [open, setOpen] = useState(0);
  return (
    <div className="page" data-testid="settings-help">
      <div className="list">
        {GUIDES.map(([title, steps], i) => (
          <div key={title} className="guide">
            <button className="list-item" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
              <span className="list-main">
                <strong>{title}</strong>
              </span>
              <Icon name={open === i ? 'chevronDown' : 'chevronRight'} size={18} />
            </button>
            {open === i && (
              <ol className="guide-steps">
                {steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
      <div className="section-label">Questions</div>
      {FAQ.map(([q, a]) => (
        <div key={q} className="card mini">
          <strong>{q}</strong>
          <p className="small muted" style={{ marginBottom: 0 }}>
            {a}
          </p>
        </div>
      ))}
      <div className="section-label">Contact us</div>
      <div className="grid-2">
        <a className="btn" href="mailto:support@reynrel.in">
          <Icon name="mail" size={18} /> Email
        </a>
        <a className="btn" href="https://www.youtube.com/@reynrel" target="_blank" rel="noreferrer">
          <Icon name="play" size={18} /> Videos
        </a>
      </div>
    </div>
  );
}

export function AboutSection() {
  const { info } = useApp();
  return (
    <div className="page" data-testid="settings-about">
      <div className="card">
        <dl className="kv">
          <dt>Version</dt>
          <dd>DocGen Mobile {APP_VERSION}</dd>
          <dt>Platform</dt>
          <dd>{info?.platform}</dd>
          <dt>Data</dt>
          <dd>{info?.dataFile}</dd>
        </dl>
      </div>
      <div className="card">
        <strong>Privacy</strong>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Your documents, customers, products, files and company details are stored only on this phone and are never uploaded. When online, DocGen checks your
          license with an anonymous device ID — never business data.
        </p>
      </div>
      <p className="center small muted">a product of reynrel.in</p>
    </div>
  );
}
