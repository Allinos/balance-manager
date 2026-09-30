import { Link, useNavigate } from 'react-router-dom';
import { clientApi, money } from '../../api.js';
import { Spinner, useLoad } from '../../components/ui.jsx';
import { Footer, useAuth } from '../../App.jsx';

export function PlanCards({ plans, onChoose, busyId, actionLabel = 'Choose plan' }) {
  return (
    <div className="plan-grid">
      {plans.map((p, i) => (
        <div key={p.id} className={`plan-card ${i === 1 ? 'featured' : ''}`}>
          {i === 1 && <span className="plan-flag">Most popular</span>}
          <h3>{p.name}</h3>
          <p className="muted">{p.description}</p>
          <div className="plan-price">
            {money(p.price, p.currency)}
            <small>{p.durationDays ? (p.durationDays >= 365 ? ` / ${Math.round(p.durationDays / 365)} year` : ` / ${p.durationDays} days`) : ' one-time'}</small>
          </div>
          <ul>
            {p.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <button className="btn btn-primary btn-block" onClick={() => onChoose(p)} disabled={busyId === p.id}>
            {busyId === p.id ? 'Please wait…' : actionLabel}
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const { client } = useAuth();
  const navigate = useNavigate();
  const { data, loading } = useLoad(() => clientApi.get('/plans'), []);
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/logo.png" alt="" />
          <span>
            <strong className="wordmark"><span className="brand-doc">Doc</span><span className="brand-gen">Gen</span></strong>
            <small>Create. Manage. Grow.</small>
          </span>
        </Link>
        <div className="topbar-user">
          {client.user ? (
            <Link className="btn btn-primary btn-sm" to="/account">
              My account
            </Link>
          ) : (
            <>
              <Link className="btn btn-sm" to="/login">
                Sign in
              </Link>
              <Link className="btn btn-primary btn-sm" to="/register">
                Create account
              </Link>
            </>
          )}
        </div>
      </header>
      <main className="container">
        <section className="hero">
          <h1>Professional invoices &amp; business documents — offline.</h1>
          <p className="muted">
            DocGen creates GST invoices, quotations, orders, challans and receipts on your computer. Create an account, pick a plan and
            activate the desktop app in minutes.
          </p>
          <div className="row">
            <Link className="btn btn-primary" to={client.user ? '/account/plans' : '/register'}>
              Get started
            </Link>
            <Link className="btn" to="/login">
              I already have an account
            </Link>
          </div>
        </section>
        <h2 className="section-title">Plans</h2>
        {loading ? (
          <Spinner />
        ) : (
          <PlanCards
            plans={data?.plans || []}
            actionLabel="Get this plan"
            onChoose={(p) => navigate(client.user ? `/account/plans?plan=${p.id}` : `/register?plan=${p.id}`)}
          />
        )}
        <section className="steps">
          <div>
            <strong>1. Create an account</strong>
            <p className="muted">Enter your business details once.</p>
          </div>
          <div>
            <strong>2. Choose a plan &amp; pay</strong>
            <p className="muted">UPI, cards or netbanking. Your activation code appears instantly.</p>
          </div>
          <div>
            <strong>3. Download &amp; activate</strong>
            <p className="muted">Download DocGen from your account and sign in with the same email.</p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
