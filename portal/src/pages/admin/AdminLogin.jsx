import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api.js';
import { ErrorText, Field, Input } from '../../components/ui.jsx';
import { useAuth } from '../../App.jsx';

export default function AdminLogin() {
  const { admin } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await adminApi.post('/auth/login', form);
      admin.signIn(r.token, r.admin);
      navigate('/admin');
    } catch (err) {
      setError(err);
    }
  };
  return (
    <div className="auth-page">
      <form className="auth-card form" onSubmit={submit}>
        <div className="brand center">
          <img src="/favicon.svg" alt="" />
          <span>
            <strong>DocGen Admin</strong>
            <small>Licenses · Clients · Ads</small>
          </span>
        </div>
        <ErrorText error={error} />
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required autoFocus />
        </Field>
        <Field label="Password">
          <Input type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required />
        </Field>
        <button className="btn btn-primary btn-block">Sign in</button>
      </form>
    </div>
  );
}
