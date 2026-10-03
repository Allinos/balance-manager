# DocGen client portal & admin panel

React + Vite single-page app, part of the [DocGen server](../README.md) and served on the
server's port (default <http://localhost:8787>) — no separate web server or port.

**Website** (`/`, `/buy`, `/login`, `/mobile`): product page with the prices per duration and a
"DocGen on Mobile" section, checkout (choose the duration, pay with Razorpay), mobile installation page.

**Client panel** (`/account/*`, sidebar; a menu on phones): My License (key, start and expiry date, days
left, computers and phones — remove one to free a place —, payments), Services (buy or extend a license:
choose the duration, see the new expiry, pay), Downloads (Windows, macOS, Linux, Mobile — as offered by the
admin), Account (details, password).

**Admin panel** (`/admin/*`, sidebar; a menu on phones): dashboard, customers (create manually, reset
password), payments (mark bank/UPI payments paid, refund), licenses (create/bulk codes, extend, computers
and phones allowed, suspend, release devices), products & pricing (a price per duration, phone limit),
downloads (per platform on/off, installer file or link; mobile on/off), website content, app configuration
(check interval, ad policy, help videos, latest version), in-app ads, activity log.

Layout: [`src/components/PanelLayout.jsx`](src/components/PanelLayout.jsx) (shared by both panels).
DocGen Mobile is a separate app in [`../mobile/`](../mobile/).

Run everything from the `server` folder (one `npm install` for backend, frontend and mobile):

```bash
cd server
npm install
npm start              # builds frontend/dist when the sources changed, then serves API + portal on :8787
npm run dev            # same port, frontend served live from frontend/src with instant reload
npm run build          # build frontend/dist and mobile/dist explicitly
npm run test:portal    # browser end-to-end test (needs Playwright + a built portal)
```

No business data from the desktop app or DocGen Mobile ever reaches the portal or server.
