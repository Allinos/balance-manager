import Icon from '../../components/Icon.jsx';
import { PageHeader } from '../../components/Common.jsx';
import { APP_CONFIG } from '../../config/appConfig.js';
import { openExternal } from '../../services/systemService.js';
import { useToast } from '../../hooks/useUi.jsx';

export default function PremiumPage() {
  const toast = useToast();
  const open = (url) => openExternal(url).catch((e) => toast.error(e.message));
  return (
    <div className="page narrow">
      <PageHeader title="Premium & Support" subtitle="DocGen is free to use. Premium adds personal help and extras." />
      <section className="card premium-card">
        <div className="premium-icon">
          <Icon name="star" size={26} />
        </div>
        <h2>DocGen Premium</h2>
        <ul className="check-list">
          {APP_CONFIG.premiumFeatures.map((f) => (
            <li key={f}>
              <Icon name="check" size={16} /> {f}
            </li>
          ))}
        </ul>
        <div className="row gap wrap">
          <button className="btn btn-primary" onClick={() => open(`https://wa.me/${APP_CONFIG.whatsappNumber}?text=${encodeURIComponent('Hi, I am interested in DocGen Premium.')}`)}>
            <Icon name="message" /> WhatsApp us
          </button>
          <button className="btn" onClick={() => open(`mailto:${APP_CONFIG.supportEmail}?subject=${encodeURIComponent('DocGen Premium')}`)}>
            <Icon name="mail" /> Email
          </button>
          <button className="btn" onClick={() => open(APP_CONFIG.website)}>
            <Icon name="globe" /> Website
          </button>
        </div>
      </section>
      <section className="card">
        <h2>Support</h2>
        <dl className="about-list">
          <dt>Email</dt>
          <dd>{APP_CONFIG.supportEmail}</dd>
          <dt>Phone</dt>
          <dd>{APP_CONFIG.supportPhone}</dd>
          <dt>Website</dt>
          <dd>{APP_CONFIG.website}</dd>
        </dl>
        <p className="muted small">These links open in your browser or mail app and need an internet connection. Everything else in DocGen works offline.</p>
      </section>
    </div>
  );
}
