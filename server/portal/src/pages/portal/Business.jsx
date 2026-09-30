import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { clientApi } from '../../api.js';
import { ErrorText, Field, Input, Select, Textarea, useToast } from '../../components/ui.jsx';
import { useAuth } from '../../App.jsx';

export const STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal',
];
export const BUSINESS_TYPES = ['Trading / Retail', 'Wholesale / Distribution', 'Manufacturing', 'Services', 'Construction / Contractor', 'Freelancer / Agency', 'Other'];

export default function Business() {
  const { client } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const u = client.user;
  const [form, setForm] = useState({
    name: u.name, phone: u.phone, business_name: u.businessName, business_type: u.businessType, gstin: u.gstin,
    address: u.address, city: u.city, state: u.state, pin: u.pin, country: u.country || 'India',
  });
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm({ ...form, [k]: v });
  useEffect(() => setError(null), [form]);

  const save = async (e) => {
    e.preventDefault();
    try {
      const r = await clientApi.put('/me', form);
      client.setUser(r.client);
      toast('Business details saved');
      if (params.get('welcome')) navigate(`/account/plans${params.get('plan') ? `?plan=${params.get('plan')}` : ''}`);
    } catch (err) {
      setError(err);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{params.get('welcome') ? 'Tell us about your business' : 'Business details'}</h1>
          <p className="muted">Used on your account and invoices from us. You can change them anytime.</p>
        </div>
      </div>
      <form className="card form" onSubmit={save}>
        <ErrorText error={error} />
        <div className="grid-2">
          <Field label="Business name">
            <Input value={form.business_name} onChange={set('business_name')} required data-testid="business-name" />
          </Field>
          <Field label="Business type">
            <Select value={form.business_type} onChange={set('business_type')} options={[{ value: '', label: 'Select…' }, ...BUSINESS_TYPES]} />
          </Field>
          <Field label="Contact person">
            <Input value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Mobile">
            <Input value={form.phone} onChange={set('phone')} />
          </Field>
          <Field label="GSTIN (optional)" error={error?.details?.fields?.gstin}>
            <Input value={form.gstin} onChange={(v) => set('gstin')(v.toUpperCase())} maxLength={15} placeholder="29ABCDE1234F1Z5" />
          </Field>
          <Field label="State">
            <Select value={form.state} onChange={set('state')} options={[{ value: '', label: 'Select…' }, ...STATES]} />
          </Field>
          <Field label="Address" span>
            <Textarea rows={2} value={form.address} onChange={set('address')} />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={set('city')} />
          </Field>
          <Field label="PIN code">
            <Input value={form.pin} onChange={set('pin')} />
          </Field>
        </div>
        <div className="row end">
          <button className="btn btn-primary" data-testid="save-business">
            {params.get('welcome') ? 'Save & choose a plan' : 'Save'}
          </button>
        </div>
      </form>
    </>
  );
}
