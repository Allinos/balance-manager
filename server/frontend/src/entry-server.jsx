/**
 * The public pages rendered to HTML on the server (backend/src/services/ssr.js), so the full text of every page —
 * features, prices, FAQ, policies, contact details — is in the HTML itself. Visitors see it at once, and search
 * engines, link previews (WhatsApp, Facebook) and AI assistants that do not run JavaScript can read it.
 * The browser then starts the app as usual (main.jsx), which draws the same page over it.
 *
 * Built with `vite build --ssr src/entry-server.jsx --outDir dist-ssr` (backend/scripts/build-portal.js).
 */

import { renderToString } from 'react-dom/server';
import { Route, Routes, StaticRouter } from 'react-router-dom';
import { setServerBoot } from './api.js';
import { AuthCtx } from './App.jsx';
import { DialogProvider, ToastProvider } from './components/ui.jsx';
import ProductPage from './pages/portal/ProductPage.jsx';
import CheckoutPage from './pages/portal/Checkout.jsx';
import OfferPage from './pages/portal/Offer.jsx';
import MobilePage from './pages/portal/MobilePage.jsx';
import SupportPage from './pages/portal/Support.jsx';
import { ForgotPasswordPage, LoginPage } from './pages/portal/Auth.jsx';
import { ContactPage, PolicyPage, POLICIES } from './pages/portal/InfoPages.jsx';

/** Address → page, title and description (for <title>, <meta name="description"> and the sitemap). */
export const PAGES = {
  '/': { element: <ProductPage />, title: 'DocGen — GST invoices, quotations & business documents software', index: true },
  '/offer': { element: <OfferPage />, title: 'DocGen — invoices, quotations & business documents', index: false },
  '/buy': { element: <CheckoutPage />, title: 'Buy DocGen — choose your plan', description: 'Buy a DocGen license: pay once for the period you choose, no auto-debit. UPI, cards and netbanking. 7-day refund policy.', index: true },
  '/mobile': { element: <MobilePage />, title: 'DocGen Mobile — invoices on your phone', description: 'DocGen on your Android phone or iPhone: all document types and templates, works offline, share as PDF. Included with your license.', index: true },
  '/support': { element: <SupportPage />, title: 'Help & Support · DocGen', description: 'Answers to common questions about DocGen, guides and how to reach us. We reply within one working day.', index: true },
  '/contact': { element: <ContactPage />, title: 'Contact Us · DocGen', description: 'Contact DocGen: email, phone and business hours. Questions before buying, license help or anything else.', index: true },
  '/login': { element: <LoginPage />, title: 'Login · DocGen', index: false },
  '/forgot-password': { element: <ForgotPasswordPage />, title: 'Forgot password · DocGen', index: false },
  ...Object.fromEntries(
    POLICIES.map((p) => [p.path, { element: <PolicyPage id={p.id} />, title: `${p.title} · DocGen`, description: `${p.title} of DocGen (Reynrel): how we handle orders, payments, refunds and your data.`, index: true }]),
  ),
};

const SIGNED_OUT = { user: null, refresh: () => {}, signIn: () => {}, signOut: () => {}, setUser: () => {} };

/**
 * HTML of a public page, or null when the address is not one of them.
 * @param {string} url  path (and query) of the request
 * @param {object} payload  the website data (GET /api/portal/site)
 */
export function render(url, payload) {
  const path = url.split('?')[0].replace(/\/+$/, '') || '/';
  const page = PAGES[path];
  if (!page) return null;
  setServerBoot(payload);
  try {
    const html = renderToString(
      <StaticRouter location={url}>
        <ToastProvider>
          <DialogProvider>
            <AuthCtx.Provider value={{ client: SIGNED_OUT, admin: SIGNED_OUT }}>
              <Routes>
                <Route path={path} element={page.element} />
              </Routes>
            </AuthCtx.Provider>
          </DialogProvider>
        </ToastProvider>
      </StaticRouter>,
    );
    return { html, title: page.title, description: page.description || '', index: page.index };
  } finally {
    setServerBoot(undefined);
  }
}

/** Addresses of the pages search engines may list (for sitemap.xml). */
export const INDEXED_PATHS = Object.entries(PAGES)
  .filter(([, p]) => p.index)
  .map(([path]) => path);
