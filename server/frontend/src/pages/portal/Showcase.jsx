/**
 * Sections shared by the website landing page (/) and the ad offer page (/offer): the intro video, saved
 * customers / vendors / products, and the 18 document types. Pictures are in public/img/offer.
 */

import Icon from '../../components/Icons.jsx';
import { embedUrl } from './ProductPage.jsx';

/** Product pictures (public/img/offer, made from the real app with sample data). */
export const IMG = (name) => `/img/offer/${name}.webp`;

/** The short DocGen video on YouTube (Admin → Website → Intro video); shown privacy-friendly via youtube-nocookie. */
export function IntroVideo({ url, autoplay = false, title = 'See DocGen in action', sub, testid = 'intro-video', className = 'offer-section' }) {
  const embed = embedUrl(url || '');
  if (!embed) return null;
  const src = autoplay ? `${embed}${embed.includes('?') ? '&' : '?'}autoplay=1&mute=1` : embed;
  const vertical = /\/shorts\//.test(url);
  return (
    <section className={className} data-testid={testid}>
      <h2>{title}</h2>
      {sub && <p className="offer-sub">{sub}</p>}
      <div className={`intro-video ${vertical ? 'vertical' : ''}`}>
        <iframe
          src={src}
          title="DocGen video"
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </section>
  );
}

/** Customers, vendors and products: saved once, picked by typing a few letters (the ads' main promise). */
const SAVED = [
  ['user', 'Customer added once', 'Next time, type two letters and pick them — address, phone and GSTIN fill in.'],
  ['box', 'Vendor added once', 'Reuse them on purchase orders, purchase bills and payment vouchers.'],
  ['file', 'Product added once', 'HSN/SAC, unit, price and GST rate come with it on every document.'],
];

export function SavedOnce() {
  return (
    <section className="offer-section" data-testid="offer-saved">
      <h2>Stop entering the same details again and again</h2>
      <p className="offer-sub">Save a customer, vendor or product the first time. After that, search, pick and your document is filled in.</p>
      <div className="saved-grid">
        {SAVED.map(([icon, title, text]) => (
          <div key={title} className="saved-card">
            <span className="saved-icon">
              <Icon name={icon} size={20} />
            </span>
            <div>
              <strong>
                {title} <Icon name="check" size={16} strokeWidth={2.8} className="saved-tick" />
              </strong>
              <p>{text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="saved-shots">
        <figure>
          <img
            src={IMG('pick-customer')}
            alt="Typing “Ra” shows the saved customers Patel Traders and Rao Constructions"
            width="1000"
            height="470"
            loading="lazy"
          />
          <figcaption>Type a few letters — pick the saved customer</figcaption>
        </figure>
        <figure>
          <img src={IMG('pick-product')} alt="Typing “chair” shows saved products with HSN, price and GST" width="1000" height="490" loading="lazy" />
          <figcaption>Pick a saved product — HSN, price and GST come with it</figcaption>
        </figure>
      </div>
    </section>
  );
}

/** The 18 document types of the app (document-generator/src/config/documentTypes.js), grouped as people think of them. */
export const DOC_GROUPS = [
  ['rupee', 'Sell', ['Tax Invoice', 'Service Invoice', 'Bill of Supply', 'Proforma Invoice', 'Credit Note', 'Debit Note']],
  ['file', 'Quote and confirm', ['Quotation', 'Estimate', 'Sales Order', 'Delivery Challan', 'Job / Service Completion']],
  ['box', 'Buy', ['Purchase Order', 'Purchase Invoice / Bill', 'Goods Receipt Note', 'Reverse Quotation', 'Work Order']],
  ['card', 'Payments', ['Payment Receipt', 'Payment Voucher']],
];
export const DOC_COUNT = DOC_GROUPS.reduce((n, [, , list]) => n + list.length, 0);

export function DocTypes() {
  return (
    <section className="offer-section" data-testid="offer-doc-types">
      <h2>{DOC_COUNT} business documents in one simple app</h2>
      <p className="offer-sub">GST and Non-GST. Every document can become the next one: quotation → invoice → payment receipt.</p>
      <div className="doc-groups">
        {DOC_GROUPS.map(([icon, title, list]) => (
          <div key={title} className="doc-group">
            <strong>
              <span className="frow-icon small">
                <Icon name={icon} size={16} />
              </span>
              {title}
            </strong>
            <ul>
              {list.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
