/**
 * DocGen Partner Programme on the website:
 *   /partners          the Partnership page (what it is, how it works, apply)
 *   /partner-terms     the partnership terms (version recorded on acceptance)
 *   /partners/apply    application with the terms checkbox
 *   /partners/login    partner sign-in
 *   /partner           the partner's dashboard: link & code, last 30 days, customers, commissions
 */

import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { date, money, partnerApi } from '../../api.js';
import { CopyButton, ErrorText, Field, Input, Spinner, Textarea, useToast } from '../../components/ui.jsx';
import Icon from '../../components/Icons.jsx';
import { SiteFooter, SiteHeader, useAuth } from '../../App.jsx';
import { useBusiness } from '../portal/InfoPages.jsx';
import { HOLD_DAYS, PARTNER_TERMS_UPDATED, PARTNER_TERMS_VERSION, PAYOUT_MINIMUM, PartnerTermsContent } from './terms.jsx';

function usePageTitle(title) {
  useEffect(() => {
    document.title = title;
    return () => {
      document.title = 'DocGen';
    };
  }, [title]);
}

const STEPS = [
  ['user', 'Apply', 'Tell us about you and how you will recommend DocGen. It takes two minutes.'],
  ['check', 'Get approved', 'We review your application and switch on your partner account, usually within two working days.'],
  ['share', 'Share your link', 'You get your own referral link and code. Share it with shops and businesses you know.'],
  ['rupee', 'Earn commission', 'Every paid order from a customer you referred earns your commission, paid monthly.'],
];

const WHO = [
  'Accountants, tax consultants and GST practitioners',
  'Computer, mobile and IT service shops',
  'Distributors and resellers of business software',
  'Trainers, YouTubers and business communities',
];

const FAQ = [
  ['Does it cost anything to join?', 'No. Joining the DocGen Partner Programme is free.'],
  [
    'How much commission do I earn?',
    'A percentage of every payment made by the customers you refer, including their renewals. Your percentage is agreed when you are approved and shown in your dashboard.',
  ],
  ['When do I get paid?', `Commissions are approved ${HOLD_DAYS} days after the sale (after the refund period) and paid monthly by bank transfer or UPI, once your balance is at least ₹${PAYOUT_MINIMUM}.`],
  ['How do you know a customer came from me?', 'Your link carries your code. We remember it for 30 days on the visitor’s device and save it on our server when they register or buy.'],
  ['What if a customer asks for a refund?', 'The commission for a refunded payment is reversed. If it was already paid, it is deducted from your next payout.'],
  ['Can I see my results?', 'Yes. Your dashboard shows clicks, registrations, sales and commissions — with the last 30 days day by day — on your phone or computer.'],
];

/** /partners — the Partnership page. */
export function PartnersPage() {
  const { partner } = useAuth();
  usePageTitle('Become a DocGen Partner · Earn by recommending DocGen');
  const signedIn = !!partner?.user;
  return (
    <div className="site">
      <SiteHeader nav />
      <main data-testid="partners-page">
        <section className="lp-section partner-hero">
          <span className="lp-eyebrow">DocGen Partner Programme</span>
          <h1>Recommend DocGen. Earn on every sale.</h1>
          <p className="lp-lead">
            Help shops and businesses move from handwritten bills to professional GST invoices — and earn a commission on every license they buy through
            your link, including renewals.
          </p>
          <div className="hero-cta">
            {signedIn ? (
              <Link className="btn btn-primary btn-lg" to="/partner" data-testid="partner-dashboard-link">
                <Icon name="chart" size={18} /> Open your partner dashboard
              </Link>
            ) : (
              <>
                <Link className="btn btn-primary btn-lg" to="/partners/apply" data-testid="partner-apply-link">
                  <Icon name="user" size={18} /> Apply to become a partner
                </Link>
                <Link className="btn btn-lg" to="/partners/login" data-testid="partner-login-link">
                  Partner login
                </Link>
              </>
            )}
          </div>
          <p className="hero-price">Free to join · Your own link and code · Monthly payouts · Dashboard on your phone</p>
        </section>

        <section className="lp-section">
          <h2 className="lp-title">How it works</h2>
          <div className="partner-steps">
            {STEPS.map(([icon, title, text], i) => (
              <div className="card partner-step" key={title}>
                <span className="partner-step-no">{i + 1}</span>
                <Icon name={icon} size={22} />
                <strong>{title}</strong>
                <p className="muted">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section partner-split">
          <div>
            <h2 className="lp-title">Who can join</h2>
            <ul className="partner-list">
              {WHO.map((w) => (
                <li key={w}>
                  <Icon name="check" size={18} /> {w}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="lp-title">What you get</h2>
            <ul className="partner-list">
              <li>
                <Icon name="link" size={18} /> Your own referral link and code
              </li>
              <li>
                <Icon name="chart" size={18} /> Live dashboard: clicks, registrations, sales and earnings
              </li>
              <li>
                <Icon name="rupee" size={18} /> Commission on first purchases and renewals
              </li>
              <li>
                <Icon name="shield" size={18} /> Clear rules: one partner per customer, refunds handled fairly
              </li>
            </ul>
          </div>
        </section>

        <section className="lp-section">
          <h2 className="lp-title">Questions</h2>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q} className="faq-item">
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 16 }}>
            Read the full <Link to="/partner-terms">Partner Terms &amp; Conditions</Link>.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

/** /partner-terms */
export function PartnerTermsPage() {
  const b = useBusiness();
  usePageTitle('Partner Terms & Conditions · DocGen');
  return (
    <div className="site">
      <SiteHeader nav />
      <main className="info-page">
        <aside className="info-side" aria-label="Partner programme">
          <strong>Partners</strong>
          <Link to="/partners">Partner Programme</Link>
          <Link to="/partners/apply">Apply</Link>
          <Link to="/partners/login">Partner login</Link>
        </aside>
        <article className="policy card" data-testid="partner-terms">
          <h1>Partner Terms &amp; Conditions</h1>
          <p className="muted small">
            Version {PARTNER_TERMS_VERSION} · Last updated: {PARTNER_TERMS_UPDATED}
          </p>
          <PartnerTermsContent b={b} />
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

function PartnerAuthCard({ title, subtitle, children }) {
  return (
    <div className="site">
      <SiteHeader nav />
      <main className="auth-page">
        <div className="auth-card partner-auth">
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** /partners/apply */
export function PartnerApplyPage() {
  const { partner } = useAuth();
  const navigate = useNavigate();
  usePageTitle('Apply · DocGen Partner Programme');
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', city: '', channel: '', password: '' });
  const [accept, setAccept] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!accept) return setError({ message: 'Please read and accept the Partner Terms & Conditions.' });
    setBusy(true);
    setError(null);
    try {
      const r = await partnerApi.post('/register', { ...form, acceptTerms: true, termsVersion: PARTNER_TERMS_VERSION });
      partner.signIn(r.token, r);
      navigate('/partner');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
    return undefined;
  };
  return (
    <PartnerAuthCard title="Apply to become a partner" subtitle="Free to join. We review every application and reply within two working days.">
      <form onSubmit={submit} className="form" data-testid="partner-apply">
        <ErrorText error={error} />
        <Field label="Your name">
          <Input value={form.name} onChange={set('name')} required minLength={2} data-testid="pa-name" />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={set('email')} required data-testid="pa-email" />
        </Field>
        <Field label="Mobile number">
          <Input type="tel" value={form.phone} onChange={set('phone')} required minLength={6} data-testid="pa-phone" />
        </Field>
        <Field label="Business name (optional)">
          <Input value={form.company} onChange={set('company')} data-testid="pa-company" />
        </Field>
        <Field label="City">
          <Input value={form.city} onChange={set('city')} data-testid="pa-city" />
        </Field>
        <Field label="How will you recommend DocGen?" hint="e.g. to my accounting clients, in my computer shop, on my YouTube channel">
          <Textarea value={form.channel} onChange={set('channel')} rows={3} maxLength={500} data-testid="pa-channel" />
        </Field>
        <Field label="Choose a password" hint="At least 8 characters">
          <Input type="password" value={form.password} onChange={set('password')} required minLength={8} data-testid="pa-password" />
        </Field>
        <label className="check terms-check">
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} data-testid="pa-terms" />
          <span>
            I have read and accept the{' '}
            <a href="/partner-terms" target="_blank" rel="noreferrer">
              Partner Terms &amp; Conditions
            </a>{' '}
            (version {PARTNER_TERMS_VERSION}).
          </span>
        </label>
        <button className="btn btn-primary btn-block" disabled={busy} data-testid="pa-submit">
          {busy ? 'Sending…' : 'Apply'}
        </button>
        <p className="muted small center">
          Already a partner? <Link to="/partners/login">Sign in</Link>
        </p>
      </form>
    </PartnerAuthCard>
  );
}

/** /partners/login */
export function PartnerLoginPage() {
  const { partner } = useAuth();
  const navigate = useNavigate();
  usePageTitle('Partner login · DocGen');
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await partnerApi.post('/login', form);
      partner.signIn(r.token, r);
      navigate('/partner');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PartnerAuthCard title="Partner login" subtitle="Your referral link, results and commissions.">
      <form onSubmit={submit} className="form" data-testid="partner-login">
        <ErrorText error={error} />
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required data-testid="pl-email" />
        </Field>
        <Field label="Password">
          <Input type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required data-testid="pl-password" />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy} data-testid="pl-submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted small center">
          Not a partner yet? <Link to="/partners/apply">Apply here</Link>
        </p>
      </form>
    </PartnerAuthCard>
  );
}

const amount = (v) => (v === null || v === undefined ? '—' : money(v));
const STATUS_TEXT = { pending: 'Pending', approved: 'Approved', paid: 'Paid', reversed: 'Reversed' };

/** Last 30 days as small bars (one per day), with the day's numbers in the tooltip. */
function DailyBars({ daily, field, label, format = (v) => v }) {
  const max = Math.max(1, ...daily.map((d) => Number(d[field] || 0)));
  return (
    <div className="partner-bars-card card">
      <div className="partner-bars-head">
        <strong>{label}</strong>
        <span className="muted small">last 30 days</span>
      </div>
      <div className="partner-bars" role="img" aria-label={`${label}, last 30 days`}>
        {daily.map((d) => (
          <span key={d.day} className="partner-bar" style={{ height: `${Math.max(2, (Number(d[field] || 0) / max) * 100)}%` }} title={`${date(d.day)}: ${format(d[field] || 0)}`} />
        ))}
      </div>
    </div>
  );
}

function PasswordForm() {
  const { partner } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ current: '', password: '' });
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await partnerApi.put('/password', form);
      partner.signIn(r.token, partner.user);
      setForm({ current: '', password: '' });
      toast.success('Password changed');
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form className="form card partner-password" onSubmit={submit}>
      <strong>Change password</strong>
      <ErrorText error={error} />
      <Field label="Current password">
        <Input type="password" value={form.current} onChange={(v) => setForm({ ...form, current: v })} required />
      </Field>
      <Field label="New password" hint="At least 8 characters">
        <Input type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required minLength={8} />
      </Field>
      <button className="btn">Change password</button>
    </form>
  );
}

/** /partner — the partner's dashboard (mobile friendly). */
export function PartnerDashboard() {
  const { partner } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  usePageTitle('Partner dashboard · DocGen');
  const [busy, setBusy] = useState(false);
  if (partner.user === undefined) return <Spinner />;
  if (!partner.user) return <Navigate to="/partners/login" replace />;
  const d = partner.user;
  const p = d.partner;
  const perms = p.permissions || {};
  const signOut = () => {
    partner.signOut();
    navigate('/partners/login');
  };
  const acceptTerms = async () => {
    setBusy(true);
    try {
      partner.setUser(await partnerApi.post('/accept-terms', { version: PARTNER_TERMS_VERSION }));
      toast.success('Thank you — terms accepted');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const shareText = `Make GST invoices, quotations and receipts in seconds with DocGen — works offline on computer and phone. Try it: ${p.link}`;
  const t = d.stats?.totals;
  const l30 = d.stats?.last30;

  return (
    <div className="site">
      <SiteHeader />
      <main className="partner-dash" data-testid="partner-dashboard">
        <div className="partner-dash-head">
          <div>
            <span className="lp-eyebrow">Partner dashboard</span>
            <h1>Hello, {p.name.split(' ')[0]}</h1>
            <p className="muted">
              {p.company ? `${p.company} · ` : ''}
              <span className={`badge tone-${p.status === 'approved' ? 'good' : p.status === 'pending' ? 'warn' : 'bad'}`} data-testid="partner-status">
                {p.status === 'approved' ? 'Approved partner' : p.status === 'pending' ? 'Application under review' : p.status}
              </span>
            </p>
          </div>
          <button className="btn" onClick={signOut} data-testid="partner-signout">
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>

        {!d.terms.accepted && (
          <div className="card partner-terms-card" data-testid="partner-terms-update">
            <strong>Our partner terms were updated</strong>
            <p className="muted">
              Please read the <a href="/partner-terms" target="_blank" rel="noreferrer">Partner Terms &amp; Conditions</a> (version {d.terms.version}) and
              accept them to continue.
            </p>
            <button className="btn btn-primary" onClick={acceptTerms} disabled={busy} data-testid="partner-accept-terms">
              I accept the updated terms
            </button>
          </div>
        )}

        {p.status === 'pending' && (
          <div className="card" data-testid="partner-pending">
            <strong>Thank you for applying!</strong>
            <p className="muted" style={{ marginBottom: 0 }}>
              We are reviewing your application and will email you at {p.email} when your partner account is approved. You accepted the partner terms
              (version {p.termsVersion}) on {date(p.termsAcceptedAt)}.
            </p>
          </div>
        )}

        {p.status === 'approved' && (
          <div className="card partner-link-card" data-testid="partner-link-card">
            <div className="partner-link-row">
              <div>
                <span className="muted small">Your referral link</span>
                <strong className="mono" data-testid="partner-link">
                  {p.link}
                </strong>
              </div>
              <CopyButton text={p.link} label="Copy link" />
            </div>
            <p className="small muted">
              Your code: <strong className="mono" data-testid="partner-code">{p.code}</strong> · Commission: <strong data-testid="partner-rate">{p.commissionRate}%</strong> of
              every payment by customers you refer
            </p>
            {perms.shareTools !== false && (
              <div className="row wrap-row">
                <a className="btn btn-green" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" data-testid="partner-whatsapp">
                  <Icon name="chat" size={16} /> Share on WhatsApp
                </a>
                <CopyButton text={shareText} label="Copy message" />
              </div>
            )}
          </div>
        )}

        {p.status === 'approved' && !d.stats && (
          <div className="card muted" data-testid="partner-dashboard-off">
            Your statistics are not shown at the moment. Please contact us for your results.
          </div>
        )}

        {t && (
          <>
            <div className="partner-cards" data-testid="partner-stats">
              <div className="card stat">
                <span className="muted small">Clicks</span>
                <strong data-testid="stat-clicks">{t.clicks}</strong>
                <small className="muted">{l30.clicks} in 30 days</small>
              </div>
              <div className="card stat">
                <span className="muted small">Registrations</span>
                <strong data-testid="stat-registrations">{t.registrations}</strong>
                <small className="muted">{l30.registrations} in 30 days</small>
              </div>
              <div className="card stat">
                <span className="muted small">Sales</span>
                <strong data-testid="stat-sales">{t.sales}</strong>
                <small className="muted">{t.salesAmount !== null ? amount(t.salesAmount) : `${t.customers} customers`}</small>
              </div>
              {t.earned !== null && (
                <>
                  <div className="card stat">
                    <span className="muted small">Total earned</span>
                    <strong data-testid="stat-earned">{amount(t.earned)}</strong>
                    <small className="muted">{amount(l30.commission)} in 30 days</small>
                  </div>
                  <div className="card stat">
                    <span className="muted small">Pending</span>
                    <strong data-testid="stat-pending">{amount(t.pending)}</strong>
                    <small className="muted">approved after {HOLD_DAYS} days</small>
                  </div>
                  <div className="card stat">
                    <span className="muted small">Paid to you</span>
                    <strong data-testid="stat-paid">{amount(t.paid)}</strong>
                    <small className="muted">{t.reversed ? `${amount(t.reversed)} reversed` : 'monthly payouts'}</small>
                  </div>
                </>
              )}
            </div>
            <div className="partner-charts" data-testid="partner-30-days">
              <DailyBars daily={d.stats.daily} field="clicks" label="Clicks" />
              <DailyBars daily={d.stats.daily} field="signups" label="Registrations" />
              <DailyBars daily={d.stats.daily} field="sales" label="Sales" />
              {l30.commission !== null && <DailyBars daily={d.stats.daily} field="commission" label="Commission" format={money} />}
            </div>

            <section className="card table-wrap">
              <h2 className="section-title">Customers you referred ({d.referred.length})</h2>
              {d.referred.length === 0 ? (
                <p className="muted">No customers yet. Share your link to get started.</p>
              ) : (
                <table className="table" data-testid="partner-referred">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Joined</th>
                      <th className="num">Purchases</th>
                      {t.salesAmount !== null && <th className="num">Paid</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {d.referred.map((c) => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>{date(c.joinedAt)}</td>
                        <td className="num">{c.purchases}</td>
                        {t.salesAmount !== null && <td className="num">{amount(c.salesAmount)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {perms.commissions !== false && (
              <section className="card table-wrap">
                <h2 className="section-title">Commissions</h2>
                {d.commissions.length === 0 ? (
                  <p className="muted">Commissions appear here when your customers pay.</p>
                ) : (
                  <table className="table" data-testid="partner-commissions">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Customer</th>
                        <th className="num">Sale</th>
                        <th className="num">Commission</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.commissions.map((c) => (
                        <tr key={c.id} data-testid="partner-commission-row">
                          <td>{date(c.createdAt)}</td>
                          <td>{c.clientName}</td>
                          <td className="num">{amount(c.base)}</td>
                          <td className="num">
                            {amount(c.amount)} <span className="muted small">({c.rate}%)</span>
                          </td>
                          <td>
                            <span className={`badge tone-${c.status === 'paid' ? 'good' : c.status === 'reversed' ? 'bad' : 'warn'}`}>{STATUS_TEXT[c.status]}</span>
                            {c.payoutRef && <div className="muted small">Ref {c.payoutRef}</div>}
                            {c.reversalReason && <div className="muted small">{c.reversalReason}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )}
          </>
        )}

        <PasswordForm />
        <p className="muted small center">
          <Link to="/partner-terms">Partner Terms &amp; Conditions</Link> · accepted version {p.termsVersion || '—'} on {date(p.termsAcceptedAt)}
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
