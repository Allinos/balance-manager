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
          <img src="/favicon.svg" alt="" />
          <span>
            <strong>DocGen</strong>
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
      const r = await clientApi.post('/auth/register', form);
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
