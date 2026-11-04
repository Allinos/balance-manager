/**
 * Screens only in DocGen for Android (see lib/native.js):
 *  - Welcome: first start — create a free account (name, business, mobile, 4-digit PIN; no password) or explore first.
 *    The account is created in Firebase by the Android app, not on the DocGen server.
 *  - Plan & Account (Settings): free plan usage, account, Upgrade (buy on the website, then enter the license key or
 *    sign in); after an upgrade this phone's data is copied to the DocGen server with the license.
 *  - Security (Settings): PIN lock on/off — asked every time the app is opened.
 *  - SMS alerts switch (Settings → Features).
 */

import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Field, Input, Sheet, Spinner, Toggle, go, useUi } from '../components/ui.jsx';
import { useApp } from '../data.jsx';
import { call } from '../engine/api.js';
import { exportData } from '../engine/backup.js';
import { activateWithKey, activateWithLogin, deviceId, formatKey, licenseToken, status as licenseStatus } from '../lib/license.js';
import { bridge, native, openLink, serverUrl } from '../lib/native.js';
import { BONUS_SETTING, FREE_LIMITS, bonusOf, isLimitError, limitOf } from '../lib/plan.js';
import { SMS_SETTING } from '../lib/notify.js';
import { DUE_REMINDERS_SETTING, dueRemindersOn, syncDues } from '../lib/dues.js';
import { LicenseSection } from './settings/system.jsx';

const PIN_RE = /^\d{4}$/;
const PHONE_RE = /^[+\d][\d\s-]{7,15}$/;

/** The account stored by the Android app (Firebase), or null. */
export async function nativeAccount() {
  const res = await bridge('account.get');
  return res?.account || null;
}

function PinInput({ value, onChange, testId, label = 'PIN' }) {
  return (
    <input
      className="input pin-input"
      type="password"
      inputMode="numeric"
      autoComplete="off"
      placeholder="••••"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
      data-testid={testId}
    />
  );
}

/** Name, business, mobile and PIN. Used on Welcome and in Plan & Account. */
function AccountForm({ onDone, submitLabel = 'Create free account' }) {
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = name.trim() && business.trim() && PHONE_RE.test(phone.trim()) && PIN_RE.test(pin) && pin === pin2;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    const res = await bridge('account.create', { name: name.trim(), business: business.trim(), phone: phone.trim(), pin });
    setBusy(false);
    if (!res?.ok) return setError(res?.error || 'The account could not be created. Please try again.');
    return onDone(res.account);
  };

  return (
    <form className="form" onSubmit={submit} data-testid="account-form">
      <Field label="Your name">
        <Input value={name} onChange={setName} placeholder="e.g. Ravi Kumar" autoComplete="name" data-testid="account-name" />
      </Field>
      <Field label="Business name">
        <Input value={business} onChange={setBusiness} placeholder="e.g. Ravi Traders" data-testid="account-business" />
      </Field>
      <Field label="Mobile number">
        <Input value={phone} onChange={setPhone} placeholder="98765 43210" type="tel" inputMode="tel" autoComplete="tel" data-testid="account-phone" />
      </Field>
      <div className="grid-2">
        <Field label="4-digit PIN" hint="No password needed">
          <PinInput value={pin} onChange={setPin} testId="account-pin" />
        </Field>
        <Field label="Repeat PIN">
          <PinInput value={pin2} onChange={setPin2} testId="account-pin2" label="Repeat PIN" />
        </Field>
      </div>
      {pin2.length === 4 && pin !== pin2 && <p className="small bad-text">The PINs are not the same.</p>}
      {error && (
        <div className="alert alert-bad" role="alert" data-testid="account-error">
          {error}
        </div>
      )}
      <button className="btn btn-primary btn-block btn-lg" disabled={!valid || busy} data-testid="account-create">
        {busy ? 'Creating…' : submitLabel}
      </button>
    </form>
  );
}

/** First start in the Android app. */
export function Welcome({ onDone }) {
  const [mode, setMode] = useState('');
  return (
    <div className="gate welcome" data-testid="welcome">
      <div className="gate-logo">
        <img src="/app/icons/icon-192.png" alt="" />
        <span className="wordmark">
          <span className="wm-doc">Doc</span>
          <span className="wm-gen">Gen</span>
        </span>
      </div>
      {mode !== 'create' ? (
        <>
          <div>
            <h1>Bills, invoices and payments on your phone</h1>
            <p className="muted">
              Free for {FREE_LIMITS.documents} documents, {FREE_LIMITS.payments} payments and {FREE_LIMITS.parties} customers &amp; vendors. Every feature is
              included.
            </p>
          </div>
          <ul className="welcome-points">
            <li>
              <Icon name="invoice" size={18} /> GST invoices and simple retail bills
            </li>
            <li>
              <Icon name="share" size={18} /> Share bills and payment reminders on WhatsApp
            </li>
            <li>
              <Icon name="chart" size={18} /> Simple reports of your sales and dues
            </li>
            <li>
              <Icon name="lock" size={18} /> Your data stays on this phone, protected by a PIN
            </li>
          </ul>
          <button className="btn btn-primary btn-block btn-lg" onClick={() => setMode('create')} data-testid="welcome-create">
            Create free account
          </button>
          <button className="btn btn-block" onClick={() => onDone(null)} data-testid="welcome-explore">
            Explore first
          </button>
        </>
      ) : (
        <>
          <div>
            <h1>Create your free account</h1>
            <p className="muted small">No password: you open DocGen with your 4-digit PIN.</p>
          </div>
          <AccountForm onDone={onDone} />
          <button className="link-btn" onClick={() => setMode('')}>
            Back
          </button>
        </>
      )}
    </div>
  );
}

/** Copy this phone's data to the DocGen server with the license (after an upgrade). */
export async function transferToServer(account) {
  const token = await licenseToken();
  if (!token) throw new Error('Activate your license first.');
  const body = JSON.stringify({ token, deviceId: await deviceId(), account: account || null, data: await exportData() });
  let res;
  try {
    res = await fetch(`${serverUrl()}/api/app/migrate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  } catch {
    throw new Error('No internet connection. Your data will be copied the next time you are online.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || 'Your data could not be copied to your account. Please try again.');
  return data;
}

function Meter({ label, used, limit, testId }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="plan-meter" data-testid={testId}>
      <div>
        <span>{label}</span>
        <strong className={used >= limit ? 'give' : ''}>
          {used} / {limit}
        </strong>
      </div>
      <span className="bar">
        <span style={{ width: `${pct}%` }} className={used >= limit ? 'full' : ''} />
      </span>
    </div>
  );
}

function ActivateSheet({ onClose, onDone }) {
  const [mode, setMode] = useState('key');
  const [key, setKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = mode === 'key' ? /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key) : email.includes('@') && password.length > 0;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'key') await activateWithKey(key);
      else await activateWithLogin(email.trim(), password);
      await onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Sheet title="I have a license" onClose={onClose} testId="activate-sheet">
      <div className="segmented" role="tablist">
        <button className={mode === 'key' ? 'active' : ''} onClick={() => setMode('key')} role="tab" aria-selected={mode === 'key'}>
          License key
        </button>
        <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} role="tab" aria-selected={mode === 'login'}>
          Email &amp; password
        </button>
      </div>
      <form className="form" onSubmit={submit}>
        {mode === 'key' ? (
          <Field label="License key" hint="From the purchase email or your account on the website">
            <Input className="input code-input" value={key} onChange={(v) => setKey(formatKey(v))} placeholder="AB12-CD34-EF56" autoCapitalize="characters" data-testid="plan-license-key" />
          </Field>
        ) : (
          <>
            <Field label="Email">
              <Input type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={setPassword} />
            </Field>
          </>
        )}
        {error && (
          <div className="alert alert-bad" data-testid="plan-activate-error">
            {error}
          </div>
        )}
        <button className="btn btn-primary btn-block" disabled={!valid || busy} data-testid="plan-activate">
          {busy ? 'Activating…' : 'Activate'}
        </button>
      </form>
    </Sheet>
  );
}

/** The website's checkout, with the free account's name and mobile filled in. */
const upgradeUrl = (account) => {
  const q = new URLSearchParams({ utm_source: 'android', ...(account ? { name: account.name || '', phone: account.phone || '' } : {}) });
  return `${serverUrl()}/buy?${q}`;
};

/** Settings → Plan & Account. */
export function PlanSection() {
  const { lic, reload } = useApp();
  const { toast } = useUi();
  const [usage, setUsage] = useState(null);
  const [account, setAccount] = useState(undefined);
  const [activating, setActivating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState(false);

  const load = useCallback(async () => {
    setUsage(await call('plan_usage'));
    setAccount(await nativeAccount());
  }, []);
  useEffect(() => {
    load().catch((e) => toast(e.message, 'bad'));
  }, [load, toast]);

  const transfer = async () => {
    setMoving(true);
    try {
      const r = await transferToServer(account);
      // The key of the license just activated (this screen may still hold the free plan's state).
      await bridge('account.upgraded', { licenseKey: (await licenseStatus()).license?.key || lic?.license?.key || '' });
      toast(`Your data is safe in your DocGen account (${r.documents ?? 0} documents, ${r.parties ?? 0} customers & vendors).`);
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setMoving(false);
    }
  };

  const activated = async () => {
    setActivating(false);
    await reload();
    toast('DocGen is upgraded: no limits and no ads.');
    await transfer();
  };

  if (lic?.state === 'active') {
    return (
      <>
        <LicenseSection />
        <div className="page" style={{ paddingTop: 0 }}>
          <div className="card form" data-testid="plan-transfer">
            <strong>Your data in your DocGen account</strong>
            <p className="small muted" style={{ margin: 0 }}>
              Copy everything on this phone (customers, vendors, documents and payments) to your DocGen account on the server.
            </p>
            <button className="btn btn-block" onClick={transfer} disabled={moving} data-testid="plan-transfer-go">
              <Icon name="upload" size={18} /> {moving ? 'Copying…' : 'Copy my data to my account'}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="page" data-testid="plan">
      <div className="card form plan-card">
        <div className="card-title">
          <h2>Free plan</h2>
          <span className="pill">Free</span>
        </div>
        {!usage ? (
          <Spinner />
        ) : (
          <>
            <Meter label="Documents" used={usage.documents} limit={usage.limits.documents} testId="plan-documents" />
            <Meter label="Payments" used={usage.payments} limit={usage.limits.payments} testId="plan-payments" />
            <Meter label="Customers & vendors" used={usage.parties} limit={usage.limits.parties} testId="plan-parties" />
            {(usage.bonus?.documents > 0 || usage.bonus?.payments > 0) && (
              <p className="small muted" style={{ margin: 0 }} data-testid="plan-bonus">
                Earned by watching ads: {[usage.bonus.documents && `${usage.bonus.documents} document${usage.bonus.documents === 1 ? '' : 's'}`, usage.bonus.payments && `${usage.bonus.payments} payment${usage.bonus.payments === 1 ? '' : 's'}`].filter(Boolean).join(' and ')}
              </p>
            )}
          </>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          Every feature is included. Upgrade for unlimited documents, no ads, your computer and your data saved in your DocGen account.
        </p>
        <button className="btn btn-primary btn-block btn-lg" onClick={() => openLink(upgradeUrl(account))} data-testid="plan-upgrade">
          <Icon name="crown" size={18} /> Upgrade
        </button>
        <button className="btn btn-block" onClick={() => setActivating(true)} data-testid="plan-have-license">
          <Icon name="key" size={18} /> I have a license key
        </button>
      </div>

      <div className="card form" data-testid="plan-account">
        <strong>Account</strong>
        {account === undefined ? (
          <Spinner />
        ) : account ? (
          <dl className="kv">
            <dt>Name</dt>
            <dd data-testid="plan-account-name">{account.name}</dd>
            <dt>Business</dt>
            <dd>{account.business}</dd>
            <dt>Mobile</dt>
            <dd>{account.phone}</dd>
          </dl>
        ) : (
          <>
            <p className="small muted" style={{ margin: 0 }}>
              You are exploring DocGen without an account. Create a free account (no password, just a PIN) so your business is ready to upgrade.
            </p>
            <button className="btn btn-block" onClick={() => setCreating(true)} data-testid="plan-create-account">
              Create free account
            </button>
          </>
        )}
      </div>

      {activating && <ActivateSheet onClose={() => setActivating(false)} onDone={activated} />}
      {creating && (
        <Sheet title="Create your free account" onClose={() => setCreating(false)} testId="account-sheet">
          <AccountForm
            onDone={(a) => {
              setCreating(false);
              setAccount(a);
              toast('Your free account is ready. Your PIN now protects DocGen.');
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

/** Settings → Security: PIN lock. */
export function SecuritySection() {
  const { toast } = useUi();
  const [enabled, setEnabled] = useState(null);
  const [sheet, setSheet] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    bridge('pin.get').then((r) => setEnabled(!!r?.enabled));
  }, []);

  const close = () => {
    setSheet('');
    setPin('');
    setPin2('');
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = sheet === 'off' ? await bridge('pin.disable', { pin }) : await bridge('pin.set', { pin });
    setBusy(false);
    if (!res?.ok) return toast(res?.error || 'That PIN is not correct.', 'bad');
    setEnabled(sheet !== 'off');
    toast(sheet === 'off' ? 'PIN lock switched off' : 'PIN lock is on. DocGen asks for it every time it opens.');
    return close();
  };

  if (enabled === null) return <Spinner />;
  const setting = sheet === 'on' || sheet === 'change';
  return (
    <div className="page" data-testid="security">
      <div className="card form">
        <Toggle
          checked={enabled}
          onChange={(v) => setSheet(v ? 'on' : 'off')}
          label="PIN lock"
          hint="Ask for your 4-digit PIN every time DocGen is opened"
          data-testid="pin-toggle"
        />
        {enabled && (
          <button className="btn btn-block" onClick={() => setSheet('change')} data-testid="pin-change">
            Change PIN
          </button>
        )}
      </div>
      <p className="small muted">Forgot your PIN? Uninstalling the app removes the PIN and everything on this phone, so keep a backup (Settings → Backup).</p>
      {sheet && (
        <Sheet title={sheet === 'off' ? 'Switch off PIN lock' : sheet === 'change' ? 'New PIN' : 'Set a PIN'} onClose={close} testId="pin-sheet">
          <form className="form" onSubmit={save}>
            <Field label={sheet === 'off' ? 'Your current PIN' : 'New 4-digit PIN'}>
              <PinInput value={pin} onChange={setPin} testId="pin-1" />
            </Field>
            {setting && (
              <Field label="Repeat PIN">
                <PinInput value={pin2} onChange={setPin2} testId="pin-2" label="Repeat PIN" />
              </Field>
            )}
            <button className="btn btn-primary btn-block" disabled={busy || !PIN_RE.test(pin) || (setting && pin !== pin2)} data-testid="pin-save">
              {sheet === 'off' ? 'Switch off' : 'Save PIN'}
            </button>
          </form>
        </Sheet>
      )}
    </div>
  );
}

/** Settings → Features: SMS alerts (Android app). */
export function SmsSwitch() {
  const { settings, updateSettings } = useApp();
  const { toast } = useUi();
  // Shown switched at once; the permission is asked and the setting saved in the background.
  const [shown, setShown] = useState(null);
  const on = shown ?? !!settings[SMS_SETTING];
  const toggle = async (next) => {
    setShown(next);
    if (next) {
      const res = await bridge('sms.permission');
      if (res && res.granted === false) {
        setShown(false);
        return toast('Allow DocGen to send SMS in your phone settings to use SMS alerts.', 'bad');
      }
    }
    await updateSettings({ [SMS_SETTING]: next });
    return toast(next ? 'SMS alerts on: customers and vendors get an SMS for new bills and payments.' : 'SMS alerts off');
  };
  return (
    <div className="list">
      <div className="list-item module-row" data-testid="module-sms">
        <span className="avatar">
          <Icon name="sms" size={19} />
        </span>
        <span className="list-main">
          <strong>SMS alerts</strong>
          <span className="small muted">Send an SMS from your phone to the customer or vendor when a bill or payment is saved. Normal SMS charges apply.</span>
        </span>
        <Toggle checked={on} onChange={toggle} label="" aria-label="SMS alerts" data-testid="module-sms-toggle" />
      </div>
    </div>
  );
}


/**
 * A free-plan limit was reached while saving. Offers, in the Android app:
 *   "Watch a short ad · +1 document" (a rewarded ad earns one more place, then the save is tried again),
 *   "See plans", or "Not now".
 * Returns true when the caller should save again. Errors that are not a limit return false untouched.
 */
export function useFreeLimit() {
  const { settings, updateSettings } = useApp();
  const { confirm, toast } = useUi();
  return useCallback(
    async (err) => {
      if (!isLimitError(err)) return false;
      const what = limitOf(err);
      const canEarn = native() && (what === 'documents' || what === 'payments');
      const one = what === 'payments' ? 'payment' : 'document';
      const choice = await confirm({
        title: 'Free plan limit reached',
        message: canEarn ? `${err.message.replace(/ Upgrade to add more.*$/, '')} Watch a short ad to make one more ${one}, or upgrade for unlimited ${one}s and no ads.` : err.message,
        confirmLabel: canEarn ? `Watch ad · +1 ${one}` : 'See plans',
        ...(canEarn ? { altLabel: 'See plans' } : {}),
        cancelLabel: 'Not now',
      });
      if ((choice === true && !canEarn) || choice === 'alt') {
        go('/settings/plan');
        return false;
      }
      if (choice !== true) return false;
      const res = await bridge('ads.rewarded');
      if (!res?.rewarded) {
        toast(res?.reason || 'No ad is available right now. Please try again in a moment.', 'bad');
        return false;
      }
      const bonus = bonusOf(settings[BONUS_SETTING]);
      await updateSettings({ [BONUS_SETTING]: { ...bonus, [what]: bonus[what] + 1 } });
      toast(`Thanks! You can make 1 more ${one}.`);
      return true;
    },
    [confirm, toast, settings, updateSettings],
  );
}

/** Settings → Features: due date reminders (Android notifications at 9:30 on the day a customer bill is due). */
export function DueRemindersSwitch() {
  const { settings, updateSettings } = useApp();
  const { toast } = useUi();
  const [shown, setShown] = useState(null);
  const on = shown ?? dueRemindersOn(settings);
  const toggle = async (next) => {
    setShown(next);
    const values = { ...settings, [DUE_REMINDERS_SETTING]: next };
    await updateSettings({ [DUE_REMINDERS_SETTING]: next });
    const res = await syncDues(values);
    if (next && res?.reason === 'permission') toast('Allow notifications for DocGen in your phone settings to get due date reminders.', 'bad');
    else toast(next ? 'Due date reminders on: a notification on the morning a bill is due.' : 'Due date reminders off');
  };
  return (
    <div className="list">
      <div className="list-item module-row" data-testid="module-dues">
        <span className="avatar">
          <Icon name="calendar" size={19} />
        </span>
        <span className="list-main">
          <strong>Due date reminders</strong>
          <span className="small muted">A notification at 9:30 on the day a customer&apos;s bill is due, with a tap to open it and send a reminder.</span>
        </span>
        <Toggle checked={on} onChange={toggle} label="" aria-label="Due date reminders" data-testid="module-dues-toggle" />
      </div>
    </div>
  );
}
