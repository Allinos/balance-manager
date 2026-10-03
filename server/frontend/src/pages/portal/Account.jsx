import { useState } from 'react';
import { clientApi, session } from '../../api.js';
import { ErrorText, Field, Input, useToast } from '../../components/ui.jsx';
import { useAuth } from '../../App.jsx';

function Profile() {
  const { client } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({
    name: client.user.name,
    phone: client.user.phone,
    business_name: client.user.businessName || '',
    gstin: client.user.gstin || '',
  });
  const [error, setError] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await clientApi.put('/me', form);
      client.setUser(r.client);
      toast('Details saved');
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form className="card form" onSubmit={save}>
      <h3>Account information</h3>
      <ErrorText error={error} />
      <Field label="Email">
        <Input value={client.user.email} onChange={() => {}} disabled />
      </Field>
      <Field label="Full name">
        <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} required minLength={2} />
      </Field>
      <div className="grid-2">
        <Field label="Mobile number">
          <Input type="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        </Field>
        <Field label="Business name (optional)">
          <Input value={form.business_name} onChange={(v) => setForm({ ...form, business_name: v })} />
        </Field>
        <Field label="GSTIN (optional)" hint="Printed on our invoices to you" error={error?.details?.fields?.gstin}>
          <Input value={form.gstin} onChange={(v) => setForm({ ...form, gstin: v.toUpperCase() })} maxLength={15} />
        </Field>
      </div>
      <div className="row end">
        <button className="btn btn-primary">Save</button>
      </div>
    </form>
  );
}

function Password() {
  const { client } = useAuth();
  const toast = useToast();
  const first = !client.user.hasPassword;
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await clientApi.put('/me/password', first ? { newPassword: form.newPassword } : form);
      session.set('client', r.token);
      client.setUser(r.client);
      setForm({ currentPassword: '', newPassword: '' });
      toast(first ? 'Password created' : 'Password changed');
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form className="card form" onSubmit={save}>
      <h3>{first ? 'Create a password' : 'Change password'}</h3>
      <p className="muted small">Use it to sign in on this website and in the DocGen apps.</p>
      <ErrorText error={error} />
      {!first && (
        <Field label="Current password">
          <Input type="password" value={form.currentPassword} onChange={(v) => setForm({ ...form, currentPassword: v })} required autoComplete="current-password" />
        </Field>
      )}
      <Field label="New password" hint="At least 8 characters">
        <Input type="password" value={form.newPassword} onChange={(v) => setForm({ ...form, newPassword: v })} required minLength={8} autoComplete="new-password" />
      </Field>
      <div className="row end">
        <button className="btn btn-primary">{first ? 'Create password' : 'Change password'}</button>
      </div>
    </form>
  );
}

export default function Account() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Account</h1>
          <p className="muted">Your details and password.</p>
        </div>
      </div>
      <Profile />
      <Password />
    </>
  );
}
