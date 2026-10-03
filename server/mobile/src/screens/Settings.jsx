/** Settings: business, bank & UPI, document terms, license, backup, about. */

import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import InstallBanner from '../components/InstallBanner.jsx';
import { Field, Header, Input, Sheet, TextArea, useUi } from '../components/ui.jsx';
import { CompanyFields } from './Setup.jsx';
import { exportAll, importAll } from '../lib/db.js';
import { APP_VERSION, signOut } from '../lib/license.js';
import { DEFAULT_TERMS, shortDate } from '../lib/docs.js';
import { useApp } from '../App.jsx';

function Row({ icon, title, detail, onClick, testid }) {
  return (
    <button className="list-item" onClick={onClick} data-testid={testid}>
      <span className="avatar">
        <Icon name={icon} size={19} />
      </span>
      <span className="list-main">
        <strong>{title}</strong>
        {detail && <span className="small muted">{detail}</span>}
      </span>
      <span className="muted">›</span>
    </button>
  );
}

function CompanySheet({ onClose }) {
  const { company, saveCompany } = useApp();
  const { toast } = useUi();
  const [form, setForm] = useState(company);
  return (
    <Sheet title="Business details" onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          await saveCompany(form);
          toast('Business details saved');
          onClose();
        }}
      >
        <CompanyFields value={form} onChange={setForm} />
        <button className="btn btn-primary btn-block">Save</button>
      </form>
    </Sheet>
  );
}

function BankSheet({ onClose }) {
  const { company, saveCompany } = useApp();
  const { toast } = useUi();
  const [form, setForm] = useState(company);
  const set = (k) => (v) => setForm({ ...form, [k]: k === 'ifsc' ? v.toUpperCase() : v });
  return (
    <Sheet title="Bank & UPI" onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          await saveCompany(form);
          toast('Bank details saved');
          onClose();
        }}
        data-testid="bank-form"
      >
        <p className="small muted" style={{ margin: 0 }}>
          Printed on invoices with a UPI QR code for the exact amount, so customers can pay at once.
        </p>
        <Field label="UPI ID">
          <Input value={form.upi} onChange={set('upi')} placeholder="yourname@okhdfcbank" autoCapitalize="none" data-testid="bank-upi" />
        </Field>
        <Field label="Account holder name">
          <Input value={form.accountName} onChange={set('accountName')} />
        </Field>
        <div className="grid-2">
          <Field label="Bank">
            <Input value={form.bankName} onChange={set('bankName')} data-testid="bank-name" />
          </Field>
          <Field label="IFSC">
            <Input value={form.ifsc} onChange={set('ifsc')} maxLength={11} data-testid="bank-ifsc" />
          </Field>
        </div>
        <Field label="Account number">
          <Input value={form.accountNumber} onChange={set('accountNumber')} inputMode="numeric" data-testid="bank-account" />
        </Field>
        <button className="btn btn-primary btn-block" data-testid="bank-save">
          Save
        </button>
      </form>
    </Sheet>
  );
}

function TermsSheet({ onClose }) {
  const { settings, saveSettings } = useApp();
  const { toast } = useUi();
  const [terms, setTerms] = useState({ ...DEFAULT_TERMS, ...(settings.terms || {}) });
  return (
    <Sheet title="Default terms" onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          await saveSettings({ ...settings, terms });
          toast('Saved');
          onClose();
        }}
      >
        {[
          ['TAX_INVOICE', 'Invoices'],
          ['QUOTATION', 'Quotations'],
          ['PROFORMA_INVOICE', 'Proforma invoices'],
          ['DELIVERY_CHALLAN', 'Delivery challans'],
        ].map(([id, label]) => (
          <Field key={id} label={label}>
            <TextArea value={terms[id]} onChange={(v) => setTerms({ ...terms, [id]: v })} rows={2} />
          </Field>
        ))}
        <button className="btn btn-primary btn-block">Save</button>
      </form>
    </Sheet>
  );
}

function LicenseCard() {
  const { lic, check, reload } = useApp();
  const { toast, confirm } = useUi();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const l = lic.license;
  return (
    <div className="card" data-testid="license-card">
      <div className="card-title">
        <h2>License</h2>
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
  );
}

export default function Settings() {
  const { company } = useApp();
  const { toast, confirm } = useUi();
  const [sheet, setSheet] = useState('');

  const backup = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `DocGen-Mobile-Backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Backup saved to Downloads');
  };
  const restore = async (file) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!(await confirm({ title: 'Restore this backup?', message: 'All documents, customers and products on this phone are replaced by the backup.', confirmLabel: 'Restore', danger: true }))) return;
      await importAll(data);
      toast('Backup restored');
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast(e.message || 'This file could not be read.', 'bad');
    }
  };

  return (
    <>
      <Header title="Settings" />
      <div className="page" data-testid="settings">
        <InstallBanner />
        <div className="list">
          <Row icon="building" title="Business details" detail={company.name} onClick={() => setSheet('company')} testid="settings-company" />
          <Row icon="bank" title="Bank & UPI" detail={company.upi || company.accountNumber ? [company.bankName, company.upi].filter(Boolean).join(' · ') : 'Not added yet'} onClick={() => setSheet('bank')} testid="settings-bank" />
          <Row icon="docs" title="Default terms" detail="Printed on new documents" onClick={() => setSheet('terms')} />
        </div>
        <LicenseCard />
        <div className="card">
          <div className="card-title">
            <h2>Backup</h2>
          </div>
          <p className="small muted" style={{ marginTop: 0 }}>
            Your documents are stored only on this phone. Save a backup file regularly (e.g. to Google Drive) to keep them safe.
          </p>
          <div className="grid-2">
            <button className="btn" onClick={backup} data-testid="backup">
              <Icon name="download" size={18} /> Save backup
            </button>
            <label className="btn">
              <Icon name="upload" size={18} /> Restore
              <input type="file" accept="application/json,.json" hidden onChange={(e) => restore(e.target.files[0])} data-testid="restore" />
            </label>
          </div>
        </div>
        <p className="center small muted">
          DocGen Mobile {APP_VERSION} · a product of reynrel.in · <a href="mailto:support@reynrel.in">support@reynrel.in</a>
        </p>
      </div>
      {sheet === 'company' && <CompanySheet onClose={() => setSheet('')} />}
      {sheet === 'bank' && <BankSheet onClose={() => setSheet('')} />}
      {sheet === 'terms' && <TermsSheet onClose={() => setSheet('')} />}
    </>
  );
}
