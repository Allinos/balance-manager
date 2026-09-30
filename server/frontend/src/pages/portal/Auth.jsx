import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { clientApi } from '../../api.js';
import { getAttribution } from '../../attribution.js';
import { ErrorText, Field, Input } from '../../components/ui.jsx';
import { useAuth } from '../../App.jsx';

function AuthCard({ title, subtitle, children }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="brand center">
          <img src="/logo.png" alt="" />
          <span>
            <strong className="wordmark"><span className="brand-doc">Doc</span><span className="brand-gen">Gen</span></strong>
            <small>Create. Manage. Grow.</small>
          </span>
        </Link>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { client } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await clientApi.post('/auth/login', form);
      client.signIn(r.token, r.client);
      navigate(params.get('next') || '/account');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthCard title="Sign in" subtitle="Use the same email and password in the DocGen desktop app.">
      <form onSubmit={submit} className="form">
        <ErrorText error={error} />
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} autoFocus required />
        </Field>
        <Field label="Password">
          <Input type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="center small">
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>
      </form>
      <p className="muted center">
        New to DocGen? <Link to="/register">Create an account</Link>
      </p>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { client } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm({ ...form, [k]: v });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await clientApi.post('/auth/register', { ...form, attribution: getAttribution() });
      client.signIn(r.token, r.client);
      navigate(`/account/business?welcome=1${params.get('plan') ? `&plan=${params.get('plan')}` : ''}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthCard title="Create your account" subtitle="After signing up you can choose a plan and activate the desktop app.">
      <form onSubmit={submit} className="form">
        <ErrorText error={error} />
        <Field label="Your name">
          <Input value={form.name} onChange={set('name')} autoFocus required minLength={2} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={set('email')} required />
        </Field>
        <Field label="Mobile (optional)">
          <Input value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input type="password" value={form.password} onChange={set('password')} required minLength={8} />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="muted center">
        Already registered? <Link to="/login">Sign in</Link>
      </p>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await clientApi.post('/auth/forgot', { email }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  if (result) {
    return (
      <AuthCard title={result.emailEnabled ? 'Check your email' : 'Contact us to reset your password'}>
        {result.emailEnabled ? (
          <p className="muted">
            If an account exists for <strong>{email}</strong>, we have sent a link to choose a new password. It works for 1 hour. Check your spam folder too.
          </p>
        ) : (
          <p className="muted">
            Write to <a href={`mailto:${result.supportEmail}`}>{result.supportEmail}</a> from <strong>{email}</strong> and we will reset it for you.
          </p>
        )}
        <p className="center">
          <Link to="/login">Back to sign in</Link>
        </p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Forgot your password?" subtitle="Enter your account email and we will send you a link to choose a new one.">
      <form onSubmit={submit} className="form">
        <ErrorText error={error} />
        <Field label="Email">
          <Input type="email" value={email} onChange={setEmail} autoFocus required />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="muted center">
        Remembered it? <Link to="/login">Sign in</Link>
      </p>
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const { client } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await clientApi.post('/auth/reset', { token: params.get('token') || '', password });
      client.signIn(r.token, r.client);
      navigate('/account');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthCard title="Choose a new password" subtitle="Use it on this website and in the DocGen desktop app.">
      <form onSubmit={submit} className="form">
        <ErrorText error={error} />
        <Field label="New password" hint="At least 8 characters">
          <Input type="password" value={password} onChange={setPassword} autoFocus required minLength={8} />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Saving…' : 'Save and sign in'}
        </button>
      </form>
      {error?.code === 'INVALID_RESET_LINK' && (
        <p className="center">
          <Link to="/forgot-password">Send a new link</Link>
        </p>
      )}
    </AuthCard>
  );
}
