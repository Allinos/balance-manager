import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { clientApi } from '../../api.js';
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
    <AuthCard title="Sign in to your account" subtitle="See your license, download DocGen and renew.">
      <form onSubmit={submit} className="form">
        <ErrorText error={error} />
        {error?.code === 'NO_PASSWORD' && (
          <Link className="btn btn-block" to="/forgot-password">
            Email me a link to create a password
          </Link>
        )}
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
        New to DocGen? <Link to="/buy">Buy DocGen</Link>
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
    <AuthCard title="Forgot your password?" subtitle="Enter the email you used when buying DocGen. We will send you a link to choose a password.">
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
    <AuthCard
      title={params.get('setup') ? 'Create your password' : 'Choose a new password'}
      subtitle="Use it to sign in on this website and in the DocGen app."
    >
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
