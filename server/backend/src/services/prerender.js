/**
 * The first screen of / and /offer, put straight into the HTML by the server, so visitors from ads see the
 * headline, the price and the button the moment the page opens — before the app's JavaScript has loaded.
 * The markup and classes are the same as the React pages (frontend/src/pages/portal/Offer.jsx, ProductPage.jsx),
 * so nothing moves when the app takes over. The page data goes in as JSON (<script type="application/json">,
 * which the Content-Security-Policy allows) so the app starts without asking the server again.
 */

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const money = (amount, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);

/** Same as Offer.jsx regularPrice: `percent` above the price, rounded up to ₹100. */
const regularPrice = (price, percent) => (percent > 0 ? Math.ceil((price * (1 + percent / 100)) / 100) * 100 : 0);

/** Same wording as ProductPage.jsx period(). */
function period(days) {
  if (!days) return 'lifetime';
  if (days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`;
  if (days % 30 === 0 && days < 365) return days === 30 ? '1 month' : `${days / 30} months`;
  return `${days} days`;
}

const CHECK =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

const brand = `<span class="brand"><img src="/logo.png" alt="" width="34" height="34" /><span><strong class="wordmark"><span class="brand-doc">Doc</span><span class="brand-gen">Gen</span></strong><small>Create. Manage. Grow.</small></span></span>`;

function priceTag(price, regular, currency) {
  if (!regular || regular <= price) return `<strong class="offer-now">${esc(money(price, currency))}</strong>`;
  return `<span class="offer-price revealed"><s class="offer-was">${esc(money(regular, currency))}</s><strong class="offer-now">${esc(money(price, currency))}</strong></span>`;
}

/** /offer: the top bar, header and hero (headline, points, price, Download button) and the demo picture. */
export function offerShell(payload) {
  const product = payload.products?.[0];
  if (!product?.prices?.length) return '';
  const percent = Number(payload.site?.offer?.regularPricePercent) || 0;
  const cheapest = product.prices.reduce((a, b) => (b.price < a.price ? b : a), product.prices[0]);
  const first = product.prices[0];
  const firstRegular = regularPrice(first.price, percent);
  const off = firstRegular > first.price ? Math.round(((firstRegular - first.price) / firstRegular) * 100) : 0;
  const docCount = 18;
  const points = ['GST &amp; Non-GST', `${docCount} document types`, 'Saved customers &amp; products', 'Easy document management'];
  return `<div class="site offer-site">
${off > 0 ? `<div class="offer-bar"><span><b>Special price: save ${off}%</b></span></div>` : ''}
<header class="site-header offer-header"><div class="site-header-inner">${brand}</div></header>
<main><section class="offer-hero offer-hero-demo"><div class="offer-hero-text">
<span class="lp-eyebrow">Simple document software for small businesses</span>
<h1>Create invoices, quotations &amp; business documents in under a minute</h1>
<p class="lp-lead">Save your customers, vendors and products once. Next time, simply search, select and create your document.</p>
<ul class="hero-points">${points.map((t) => `<li>${CHECK} ${t}</li>`).join('')}</ul>
<div class="hero-offer"><span>Start with ${cheapest.durationDays ? esc(period(cheapest.durationDays)) : 'a lifetime license'} — ${priceTag(cheapest.price, regularPrice(cheapest.price, percent), product.currency)}</span><small>One-time payment · No auto-renewal · 7-day refund policy</small></div>
<div class="hero-ctas"><a class="btn btn-primary btn-lg" href="/buy?price=${esc(cheapest.id ?? '')}">Download – ${esc(money(cheapest.price, product.currency))}</a></div>
</div>
<figure class="demo"><div class="app-frame demo-frame"><div class="app-frame-bar"><i></i><i></i><i></i><span class="demo-label">DocGen · making a quotation</span></div><div class="demo-video"><img src="/img/offer/demo-poster.webp" alt="DocGen: a finished quotation" width="1280" height="720" fetchpriority="high" style="display:block;width:100%;height:auto" /></div></div></figure>
</section></main></div>`;
}

/** /: header and hero (headline, text, Buy button) as the website shows them. */
export function landingShell(payload) {
  const site = payload.site || {};
  const product = payload.products?.[0];
  const from = product ? (product.prices?.length ? Math.min(...product.prices.map((p) => p.price)) : product.price) : null;
  return `<div class="site">
<header class="site-header"><div class="site-header-inner">${brand}</div></header>
<main><section class="lp-section hero"><div>
<span class="lp-eyebrow">Simple document software for small businesses</span>
<h1>${esc(site.headline)}</h1>
<p class="lp-lead">${esc(site.subheadline)}</p>
<div class="hero-cta"><a class="btn btn-primary btn-lg" href="/buy">${from !== null ? `Buy now — from ${esc(money(from, product.currency))}` : 'See pricing'}</a></div>
</div></section></main></div>`;
}

/** A plain "Loading…" for the other pages (shown only if the app takes more than a moment). */
export const LOADING = '<p class="boot-loading" style="font:15px/1.5 system-ui,sans-serif;color:#64748b;text-align:center;margin:30vh 0 0">Loading…</p>';

/** The page data for the app, as JSON that cannot end the <script> element early. */
export const bootData = (payload) => `<script type="application/json" id="boot-site">${JSON.stringify(payload).replace(/</g, '\\u003c')}</script>`;

/** Put the first screen and the data into the HTML (index.html has <div id="root"><!--app-shell--></div>). */
export function withShell(html, shell, payload) {
  return html.replace('<!--app-shell-->', shell || LOADING).replace('</body>', `${payload ? bootData(payload) : ''}\n  </body>`);
}
