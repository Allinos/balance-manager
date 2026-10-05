/**
 * Contact Us and the policies the website needs for payments and ads: Terms & Conditions, Privacy Policy,
 * Shipping Policy, Cancellation & Refunds. Business name, address, phone, hours and the court city come
 * from Admin → Website → Business details.
 */

import { useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { clientApi } from '../../api.js';
import { useLoad } from '../../components/ui.jsx';
import Icon from '../../components/Icons.jsx';
import { SiteFooter, SiteHeader } from '../../App.jsx';
import { SUPPORT_EMAIL } from '../../constants.js';
import { SupportForm } from './Support.jsx';

/** Date the policies below were last changed. Update it whenever their text changes. */
export const POLICIES_UPDATED = '5 October 2026';

const DEFAULT_BUSINESS = { legalName: 'Reynrel', address: '', phone: '', hours: 'Monday to Saturday, 10:00 to 18:00 IST', jurisdiction: '' };

let siteCache = null;
/** Website content and business details, loaded once per visit (refreshed after a minute). */
export function useSite() {
  return useLoad(() => {
    if (!siteCache || Date.now() - siteCache.at > 60000) {
      siteCache = {
        at: Date.now(),
        promise: clientApi.get('/site').catch((e) => {
          siteCache = null;
          throw e;
        }),
      };
    }
    return siteCache.promise;
  }, []);
}

export function useBusiness() {
  const { data } = useSite();
  const b = { ...DEFAULT_BUSINESS, ...data?.site?.business };
  return { ...b, legalName: b.legalName || DEFAULT_BUSINESS.legalName, email: data?.supportEmail || SUPPORT_EMAIL };
}

export const POLICIES = [
  { id: 'terms', path: '/terms', title: 'Terms & Conditions' },
  { id: 'privacy', path: '/privacy', title: 'Privacy Policy' },
  { id: 'shipping', path: '/shipping', title: 'Shipping Policy' },
  { id: 'refunds', path: '/refunds', title: 'Cancellation & Refunds' },
];

const Mail = ({ b }) => <a href={`mailto:${b.email}`}>{b.email}</a>;
const Courts = ({ b }) => (b.jurisdiction ? <>the courts at {b.jurisdiction}, India</> : <>the courts having jurisdiction over our place of business in India</>);

function ContactLines({ b }) {
  return (
    <ul className="policy-contact">
      <li>
        <strong>{b.legalName}</strong> (DocGen, reynrel.in)
      </li>
      {b.address && <li>{b.address}</li>}
      <li>
        Email: <Mail b={b} />
      </li>
      {b.phone && <li>Phone: {b.phone}</li>}
      <li>
        Or send a request through <Link to="/support">Help &amp; Support</Link>.
      </li>
    </ul>
  );
}

function Terms({ b }) {
  return (
    <>
      <p>
        These Terms &amp; Conditions apply when you visit this website, buy a DocGen license or use the DocGen apps (DocGen for Windows, macOS and
        Linux, and DocGen Mobile). DocGen is a product of <strong>{b.legalName}</strong> (“we”, “us”). By buying a license or using DocGen you agree to
        these terms. If you do not agree, please do not buy or use DocGen.
      </p>
      <h2>1. Your license</h2>
      <ul>
        <li>
          When you pay, you receive a personal, non-exclusive and non-transferable license to use DocGen for your own business for the period you
          bought (for example 1 year, 2 years or 5 years), on the number of computers and phones shown for that plan.
        </li>
        <li>The period starts on the day of payment. When you extend a license, the new period is added to its current end date.</li>
        <li>
          Every plan is a <strong>one-time payment</strong>. Nothing renews or is charged automatically. When the period ends, DocGen stops creating new
          documents until you extend the license; your saved documents stay on your device.
        </li>
        <li>You may move the license to another device by releasing the old device in your account.</li>
      </ul>
      <h2>2. Your account</h2>
      <ul>
        <li>Please give correct details (name, email, mobile number). We send your license key, receipts and important notices to your email.</li>
        <li>Keep your password and license key private. You are responsible for what happens with your account and key.</li>
        <li>
          We may suspend a license that is shared beyond its device limit, bought with fraudulent payment, or used against these terms. We will tell
          you why by email.
        </li>
      </ul>
      <h2>3. Prices and payment</h2>
      <ul>
        <li>Prices are shown in Indian Rupees (₹) on the website and at checkout, before you pay. The amount at checkout is the amount charged.</li>
        <li>
          Payments are processed securely by Razorpay (UPI, cards, net banking, wallets). We never see or store your card or UPI details. Payments are
          also subject to Razorpay’s terms.
        </li>
        <li>We may change prices for future purchases. A change never affects a license you have already paid for.</li>
      </ul>
      <h2>4. Delivery, cancellation and refunds</h2>
      <p>
        DocGen is delivered online right after payment — see the <Link to="/shipping">Shipping Policy</Link>. Cancellations and refunds are explained in
        the <Link to="/refunds">Cancellation &amp; Refunds</Link> policy.
      </p>
      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>copy, sell, rent, share or publish DocGen or license keys, or let others use your license beyond its device limit;</li>
        <li>remove or bypass the license check, or decompile, modify or reverse engineer DocGen, except where the law allows it;</li>
        <li>use DocGen to create false, misleading or unlawful documents, or for any illegal purpose.</li>
      </ul>
      <h2>6. Your documents and data</h2>
      <ul>
        <li>
          Your documents, customers and products are stored on your own computer or phone, not on our servers. Please make regular backups (DocGen
          has a backup option). We cannot recover data lost from your device.
        </li>
        <li>
          DocGen helps you prepare invoices and other documents, including GST calculations. You remain responsible for checking the documents you
          issue and for meeting your tax and legal obligations. DocGen is not tax, legal or accounting advice.
        </li>
        <li>
          How we handle the personal data we do receive is described in the <Link to="/privacy">Privacy Policy</Link>.
        </li>
      </ul>
      <h2>7. Updates and support</h2>
      <p>
        During your license period you receive DocGen updates and support by email and through Help &amp; Support. We aim to answer within one working
        day. We may improve, change or remove features over time.
      </p>
      <h2 id="ads">8. Advertisements in the DocGen apps</h2>
      <p>The DocGen desktop app shows occasional advertisements and announcements, under these rules:</p>
      <ul>
        <li>
          <strong>15 ad-free days:</strong> no advertisement is shown during the first 15 days after you first start DocGen, and again for 15 days
          after you activate a license.
        </li>
        <li>
          <strong>How often:</strong> after that, at most one advertisement every 15 days, at most one each time you open DocGen, and never more
          than two in a calendar month. We may show them less often, never more often.
        </li>
        <li>
          <strong>Missed ads are not saved up:</strong> if an advertisement was due while DocGen was closed or your computer was offline, it is
          simply skipped. When you open DocGen again — even after several months — you see at most one advertisement, the one that applies at that
          moment, never a backlog of old ones.
        </li>
        <li>
          <strong>Never during your work:</strong> advertisements appear a few seconds after start-up on overview pages only (Dashboard, Document
          Manager, Help) — never while you create or edit a document, and never on printed documents or PDFs.
        </li>
        <li>
          <strong>How they look:</strong> a medium-sized window in the middle of the screen over a slightly dimmed background. You can close it at
          once with ×, “Not now”, the Esc key or a click beside it. Nothing is opened unless you click its button.
        </li>
        <li>
          <strong>Without internet:</strong> DocGen shows only advertisements built into the app, for products and services of{' '}
          {b.legalName} / reynrel.in. With internet, it may also show current announcements and offers from us.
        </li>
        <li>
          <strong>Privacy:</strong> advertisements never read or send your documents, customers or products. Only anonymous counts (shown, closed,
          clicked) are sent, without any information about you or your business.
        </li>
      </ul>
      <h2>9. Warranty and liability</h2>
      <ul>
        <li>We work hard to keep DocGen reliable, but it is provided “as is”, without a promise that it will be free of errors or always available.</li>
        <li>
          To the extent the law allows, we are not liable for indirect or consequential losses (such as lost profit, lost data or business
          interruption), and our total liability for any claim is limited to the amount you paid for the license concerned in the 12 months before
          the claim.
        </li>
        <li>Nothing in these terms limits rights you have under Indian consumer protection law.</li>
      </ul>
      <h2>10. Intellectual property</h2>
      <p>DocGen, its design, templates and code belong to {b.legalName}. The license lets you use them; it does not transfer ownership.</p>
      <h2>11. Changes to these terms</h2>
      <p>
        We may update these terms. The date at the top shows the latest version. Important changes are announced by email or on this website. The
        terms in force when you bought a license continue to apply to that purchase.
      </p>
      <h2>12. Governing law</h2>
      <p>
        These terms are governed by the laws of India. Any dispute will be handled by <Courts b={b} />. Before going to court, please contact us — most
        problems are solved quickly.
      </p>
      <h2>13. Contact</h2>
      <ContactLines b={b} />
    </>
  );
}

function Privacy({ b }) {
  return (
    <>
      <p>
        This Privacy Policy explains what personal information <strong>{b.legalName}</strong> collects when you use this website and DocGen, why, and
        your choices. We collect as little as we need and we never sell your information.
      </p>
      <h2>1. Your business documents stay with you</h2>
      <p>
        The invoices, quotations and other documents you create in DocGen — and the customers, products and prices in them — are stored only on your
        own computer or phone. They are not uploaded to our servers and we cannot see them.
      </p>
      <h2>2. What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your name, email address, mobile number and password (stored only as a secure hash). Optionally your
          business name, GSTIN and address, if you add them.
        </li>
        <li>
          <strong>Purchases:</strong> the plan, amount, date and the Razorpay order and payment reference. Card, UPI and bank details are handled by
          Razorpay and never reach us.
        </li>
        <li>
          <strong>License and devices:</strong> your license key, and for each activated device its name, type (for example Windows or Android), app
          version, a device identifier and when it last checked the license.
        </li>
        <li>
          <strong>Help &amp; Support:</strong> the messages you send us and our replies.
        </li>
        <li>
          <strong>Website visits:</strong> which advertisement or link brought you to the website (campaign tags), and technical data such as your IP
          address in our security logs.
        </li>
      </ul>
      <h2>3. Why we use it</h2>
      <ul>
        <li>to create your account, take payments, issue and check licenses and send receipts and license keys;</li>
        <li>to answer your questions and give support;</li>
        <li>to send important messages about your license (for example before it ends) — no marketing messages without your consent;</li>
        <li>to keep the service secure and prevent fraud and misuse of license keys;</li>
        <li>to understand, in total numbers, which advertisements bring customers, and to improve DocGen;</li>
        <li>to meet legal duties, such as keeping tax records.</li>
      </ul>
      <h2>4. Who we share it with</h2>
      <p>Only with service providers that help us run DocGen, and only what they need:</p>
      <ul>
        <li>Razorpay, to process payments (see Razorpay’s privacy policy);</li>
        <li>our email provider, to send receipts, license keys and support replies;</li>
        <li>our hosting provider, where our servers and database run.</li>
      </ul>
      <p>We share information with authorities only when the law requires it.</p>
      <h2>5. Cookies and browser storage</h2>
      <p>
        The website uses your browser’s storage to keep you signed in and to remember which advertisement brought you here. We do not use third-party
        advertising cookies. The payment window is provided by Razorpay and the product videos by YouTube or Vimeo, which may use their own cookies.
      </p>
      <h2>6. Security and how long we keep data</h2>
      <p>
        All connections use HTTPS, passwords are hashed and access to our systems is restricted. We keep your account while you use DocGen. Payment
        and invoice records are kept as long as Indian tax law requires. Support messages and security logs are deleted when no longer needed.
      </p>
      <h2>7. Your choices and rights</h2>
      <ul>
        <li>You can see and correct your details in your account (Account page).</li>
        <li>
          You can ask us for a copy of your information, or to delete your account, by writing to <Mail b={b} />. We keep only what the law requires
          us to keep.
        </li>
        <li>DocGen is meant for businesses and is not intended for children under 18.</li>
      </ul>
      <h2>8. Changes</h2>
      <p>If we change this policy, we update the date at the top and tell you about important changes by email or on the website.</p>
      <h2>9. Contact and grievances</h2>
      <p>For privacy questions or complaints, contact:</p>
      <ContactLines b={b} />
    </>
  );
}

function Shipping({ b }) {
  return (
    <>
      <p>
        DocGen is software. <strong>Nothing is shipped physically</strong>, so there are no shipping charges and no delivery address is needed.
      </p>
      <h2>1. How DocGen is delivered</h2>
      <ul>
        <li>Right after a successful payment, your license key is shown on the screen and you are signed in to your account.</li>
        <li>The license key, receipt and download links are also sent to the email address you entered at checkout.</li>
        <li>
          Your account always has the license key and the download for Windows, macOS or Linux, and the link to install DocGen Mobile on your phone.
        </li>
      </ul>
      <h2>2. Delivery time</h2>
      <p>
        Delivery is immediate — usually within a minute of payment. If a payment is still being confirmed by your bank, it can take a little longer; the
        license is issued automatically as soon as the payment is confirmed.
      </p>
      <h2>3. Did not receive your license?</h2>
      <ul>
        <li>Check your spam or promotions folder for an email from DocGen.</li>
        <li>
          <Link to="/login">Log in</Link> to your account — the license key is under My License.
        </li>
        <li>
          If the amount was deducted but you have no license after 24 hours, contact us with your payment reference through{' '}
          <Link to="/support">Help &amp; Support</Link> or at <Mail b={b} />. We will deliver the license within one working day or refund the
          payment.
        </li>
      </ul>
      <h2>4. Where we deliver</h2>
      <p>DocGen is delivered online and can be bought from anywhere. Prices are in Indian Rupees (₹).</p>
      <h2>5. Contact</h2>
      <ContactLines b={b} />
    </>
  );
}

function Refunds({ b }) {
  return (
    <>
      <p>
        We want you to be happy with DocGen. This policy explains how cancellation and refunds work for DocGen licenses sold by{' '}
        <strong>{b.legalName}</strong>.
      </p>
      <h2>1. No subscriptions, nothing to cancel</h2>
      <p>
        Every DocGen plan is a <strong>one-time payment</strong> for a fixed period. There is no automatic renewal and no future charge, so there is no
        subscription to cancel. When the period ends, you decide whether to extend.
      </p>
      <h2>2. Cancelling before payment</h2>
      <p>
        You can stop at any time before the payment is completed — just close the payment window. Nothing is charged. If money was deducted but the
        payment failed, your bank or Razorpay returns it automatically, usually within 5–7 working days.
      </p>
      <h2>3. When you can get a refund</h2>
      <p>You can ask for a full refund within 7 days of the payment if:</p>
      <ul>
        <li>the license key has not been activated on any computer or phone; or</li>
        <li>DocGen does not work on your device and our support team cannot fix the problem; or</li>
        <li>you were charged twice for the same order (the extra payment is always refunded).</li>
      </ul>
      <h2>4. When a refund is not possible</h2>
      <ul>
        <li>more than 7 days after the payment (except duplicate payments);</li>
        <li>after the license has been activated and used, when DocGen works as described;</li>
        <li>for a license suspended because of misuse or a breach of the Terms &amp; Conditions.</li>
      </ul>
      <h2>5. How to ask for a refund</h2>
      <p>
        Send a request through <Link to="/support">Help &amp; Support</Link> (topic “Cancellation &amp; refund”) or email <Mail b={b} /> with your
        email address and payment reference. We reply within 2 working days.
      </p>
      <h2>6. How refunds are paid</h2>
      <ul>
        <li>Approved refunds are paid to the original payment method (UPI, card, net banking or wallet) through Razorpay.</li>
        <li>The refund is started within 2 working days of approval and usually reaches you within 5–7 working days, depending on your bank.</li>
        <li>When a refund is paid, the license is deactivated.</li>
      </ul>
      <h2>7. Contact</h2>
      <ContactLines b={b} />
    </>
  );
}

const CONTENT = { terms: Terms, privacy: Privacy, shipping: Shipping, refunds: Refunds };

export function PolicyPage({ id }) {
  const b = useBusiness();
  const policy = POLICIES.find((p) => p.id === id);
  const Content = CONTENT[id];
  useEffect(() => {
    document.title = `${policy.title} · DocGen`;
    window.scrollTo(0, 0);
    return () => {
      document.title = 'DocGen';
    };
  }, [policy.title]);
  return (
    <div className="site">
      <SiteHeader nav />
      <main className="info-page">
        <aside className="info-side" aria-label="Policies">
          <strong>Policies</strong>
          {POLICIES.map((p) => (
            <NavLink key={p.id} to={p.path}>
              {p.title}
            </NavLink>
          ))}
          <NavLink to="/contact">Contact Us</NavLink>
        </aside>
        <article className="policy card" data-testid={`policy-${id}`}>
          <h1>{policy.title}</h1>
          <p className="muted small">Last updated: {POLICIES_UPDATED}</p>
          <Content b={b} />
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

export function ContactPage() {
  const b = useBusiness();
  useEffect(() => {
    document.title = 'Contact Us · DocGen';
    return () => {
      document.title = 'DocGen';
    };
  }, []);
  return (
    <div className="site">
      <SiteHeader nav />
      <main className="contact-page">
        <div className="lp-head">
          <span className="lp-eyebrow">Contact Us</span>
          <h1 className="lp-title">We are happy to help</h1>
          <p className="lp-lead">Questions before buying, help with your license, or anything else — write to us and we reply within one working day.</p>
        </div>
        <div className="contact-grid">
          <div className="contact-details card" data-testid="contact-details">
            <h2>{b.legalName}</h2>
            <p className="muted small">Makers of DocGen · reynrel.in</p>
            <ul className="contact-list">
              <li>
                <Icon name="mail" size={18} />
                <span>
                  <small>Email</small>
                  <Mail b={b} />
                </span>
              </li>
              {b.phone && (
                <li>
                  <Icon name="phone" size={18} />
                  <span>
                    <small>Phone</small>
                    <a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`}>{b.phone}</a>
                  </span>
                </li>
              )}
              {b.address && (
                <li>
                  <Icon name="pin" size={18} />
                  <span>
                    <small>Address</small>
                    {b.address}
                  </span>
                </li>
              )}
              {b.hours && (
                <li>
                  <Icon name="clock" size={18} />
                  <span>
                    <small>Support hours</small>
                    {b.hours}
                  </span>
                </li>
              )}
            </ul>
            <div className="contact-links">
              <Link to="/support" className="btn btn-block">
                <Icon name="help" size={17} /> Help &amp; Support
              </Link>
              <Link to="/login" className="btn btn-block btn-ghost">
                Customer login
              </Link>
            </div>
          </div>
          <div className="card">
            <h2 className="contact-form-title">Send us a message</h2>
            <SupportForm source="contact" defaultTopic="buying" />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
