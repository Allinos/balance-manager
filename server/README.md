# DocGen server

Backend API for the DocGen apps ([`backend/`](backend/)), the client portal and admin panel
([`frontend/`](frontend/)) **and** DocGen Mobile ([`mobile/`](mobile/)) — run together as one Node.js
application on **one port** (default `8787`). One `npm install` in this folder installs all three (npm workspaces).

```
Admin panel → products, prices per duration, licenses, downloads
     │
Client panel → Services: product → duration → Razorpay payment → server verifies → license key
     │
     ├── My License: key, start date, expiry date, computers and phones in use, Extend
     ├── Downloads: Windows · macOS · Linux · Mobile (whatever the admin offers)
     └── Mobile → /mobile install page → DocGen Mobile (PWA at /app/) → key → works on the phone
```

- **Sales funnel**: product page → duration (1, 2, 5 years … set by the admin) → name, mobile, email →
  payment (Razorpay: UPI, cards, netbanking, wallets) → account created and signed in → license key +
  **download**. Ad clicks (UTM tags, Google `gclid`, Facebook `fbclid`) are tracked per customer and per campaign.
- **Client panel** (sidebar; a menu on phones): **My License** (key, product, start and expiry date,
  days left, computers and phones using it — remove one to free a place —, payments), **Services**
  (buy a license or extend one: choose the duration, see the current and the new expiry, pay),
  **Downloads** (Windows, macOS, Linux, Mobile) and **Account** (details, password).
- **Products, payments, licenses**: each product has a price per duration (e.g. 1 year ₹1,250,
  2 years ₹2,250, 5 years ₹4,999; any number of days or lifetime), a computer limit and a phone limit —
  all set in the admin panel. License keys (`AB12-CD34-EF56`), extensions add the bought duration to the
  current expiry; email with the key, validity and download links.
- **App API** (desktop and mobile): account sign-in, key activation, license refresh/release — computers
  and phones are counted separately and the limits are enforced by the server — plus remote
  configuration (check interval, ads, help videos) and anonymous ad counters for the desktop app.
- **DocGen Mobile**: installable web app (PWA) for Android and iPhone at `/app/` with the desktop app's features
  (all document types, the 4 templates, documents, products, settings) — works on the phone (IndexedDB),
  license key stored on the device, no repeated sign-in while the license is valid. See [DocGen Mobile](#docgen-mobile).
- **Admin panel** (sidebar; a menu on phones): dashboard (sales this month, revenue, recent sales,
  licenses ending soon, ad campaigns), customers, payments (with the duration bought; mark paid, refund),
  licenses (give without payment, bulk codes, extend, computers/phones allowed, suspend, revoke),
  products & pricing (prices per duration, phone limit), downloads (per platform: on/off, installer file
  or link; mobile on/off), website content (headline, screenshots, videos), desktop app settings, in-app
  ads, activity log.
- Serves everything on the same port: `/` website and client panel, `/admin` admin panel, `/app/`
  DocGen Mobile, `/api` API.

Stack: Node.js 20+, Express 5, Knex (MySQL 8 in production, SQLite for development),
bcrypt, JWT sessions, zod validation, rate limits, helmet.

## Quick start

```bash
cd server
npm install                 # better-sqlite3 is optional; if it cannot be built, install still succeeds
cp .env.example .env        # Windows: copy .env.example .env   — then edit DB_*, ADMIN_*, JWT_SECRET
npm start                   # builds the portal if needed, then API + portal + admin on http://localhost:8787
```

After an update (`git pull`) just run `npm start` again: it installs any new packages by itself
(`npm install`) and rebuilds the website and DocGen Mobile. If the browser shows nothing, look at the
terminal — the server prints `DocGen server listening on http://localhost:8787` when it is ready; open
that address (not the files in `frontend/`). If it stopped with an error instead, the message says what to do.
If `git pull` stops with *"Your local changes to … package-lock.json would be overwritten"* (a manual
`npm install` rewrote it), run `git checkout -- server/package-lock.json` and pull again — nothing of yours is lost.

| Command | What it does |
|---------|--------------|
| `npm start` | builds `frontend/dist` when the frontend sources changed, then serves everything on `PORT` |
| `npm run dev` | same port; the frontend is served live from `frontend/src` (instant reload) and the API restarts on changes |
| `npm run build` | builds `frontend/dist` and `mobile/dist` |
| `npm test` / `npm run test:portal` / `npm run test:mobile` | API tests / browser test of the website, client panel and admin panel / browser test of DocGen Mobile (phone-sized) |

Folder layout:

```
server/
├── package.json    workspace root — run all npm commands here
├── .env            your settings (copy .env.example)
├── backend/        API (Express)
│   ├── src/        routes, services, payments, migrations
│   ├── scripts/    migrate, create-admin, build-portal, load test …
│   └── test/       API tests
├── frontend/       website, client panel + admin panel (React + Vite) → frontend/dist
├── mobile/         DocGen Mobile, installable web app (React + Vite, IndexedDB; uses ../document-generator/src) → mobile/dist, at /app/
└── data/           database (SQLite), license key, uploads — created at first start
```

The server reads `server/.env` (real environment variables take precedence). With
`DB_NAME` (+ `DB_HOST`, `DB_USER`, `DB_PASSWORD`) or `DATABASE_URL=mysql://…` it uses MySQL; if
it cannot connect, it says why (wrong password, missing database, MySQL not running) and how to fix it. Without it, it uses a local SQLite file, which needs the
optional `better-sqlite3` module (prebuilt for common Node versions; otherwise it needs C++ build
tools — not needed at all when you use MySQL).

On first start the server creates `data/` with the **license signing key** and prints the
**license public key** — put it into `document-generator/src-tauri/remote-config.json → licensePublicKey`.

Admin panel: `/admin/login`. Website: `/` (product page), `/buy` (checkout; `/register` leads here), `/login`,
`/forgot-password`, `/account` (client panel: `/account/services`, `/account/downloads`, `/account/settings`),
`/mobile` (mobile installation page). DocGen Mobile: `/app/`.

## Architecture

```
 Ad (Google / Meta / …)            DocGen desktop app (PC/Mac)      DocGen Mobile (phone, PWA)
        │  https://docgen.reynrel.in/?utm_…   │ /api/app (deviceKind desktop)   │ /api/app (deviceKind mobile)
        ▼                                     │ no business data                │ no business data
 ┌───────────────────────────── one Node.js process, one port ─────────────────────────────┐
 │ frontend/ (React SPA)            backend/ (Express 5)                                    │
 │  /            product page        /api/portal  site, checkout, account, licenses, downloads│
 │  /buy, /login, /account/…         /api/admin   admin panel API                            │
 │  /mobile      install page        /api/app     app API: sign in, activate, refresh,       │
 │  /admin       admin panel                      release, config & in-app ads              │
 │ mobile/ (React PWA)               /api/payments/webhook/razorpay   /api/downloads/<link>  │
 │  /app/        DocGen Mobile                                                               │
 └───────────────┬───────────────────────────────┬───────────────────────────┬─────────────┘
                 │                               │                           │
            MySQL 8 (Knex)               data/ (license key,           Razorpay, SMTP
                                         installers, ad images)
```

Customer journey, and what guarantees each step:

1. **Ad click → product page.** The first page stores the ad tags (`utm_*`, `gclid`, `fbclid`, referrer)
   in the browser for 60 days; they are saved with the customer at checkout.
2. **Buy now → name, mobile, email.** `POST /api/portal/checkout/start` creates the account (no password
   yet) and the order. An email that already has an account (with a password or a purchase) must sign in.
3. **Pay.** The server creates a Razorpay order for the price of the chosen duration (the browser sends
   only the product and price ids) — the browser never decides the amount. The payment counts only with a valid Razorpay signature (browser callback) or signed
   webhook with the full amount. Webhook and callback arriving together issue **one** license
   (row lock). Test payments are impossible unless `ENABLE_MOCK_PAYMENTS=true` outside production.
4. **Account + license + email.** After payment the customer is signed in automatically and sees the
   license key (valid for the bought duration from today), validity and Download button. The email has the
   key, the end date, download links (7 days) and a link to create a password (7 days).
   Extending from the client panel (Services) adds the chosen duration to the expiry date of the same
   license (or to today if it has already expired); the page shows the new expiry before paying.
5. **Download.** Only customers with an active license can download. Links are personal (30 minutes on
   the website, 7 days in the email) and always serve the latest uploaded installer.
6. **Activate.** The desktop app or DocGen Mobile takes the license key (or the email + password) and
   gets a signed, device-bound license token that works offline. The server refuses a computer or phone
   beyond the license's limit.

## Keys and secrets: what is public, what stays on the server

| | What | Where it lives |
|---|------|----------------|
| **Frontend / public configuration** | Razorpay **Key ID** (`rzp_live_…`/`rzp_test_…`), the order id and the amount of one order; the license **public** key; product names, prices and durations; the site content | Sent by the server at run time: the Key ID only inside the response to `POST /api/portal/checkout` (together with the server-created order), the public key from `GET /api/app/public-key`, the rest from `GET /api/portal/site`. Neither `frontend/` nor `mobile/` contains keys or `.env` values — they are built without any environment variables |
| **Backend secret credentials** | `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `JWT_SECRET`, the database password, `SMTP_URL`, the license **private** key (`data/license-private-key.pem` or `LICENSE_PRIVATE_KEY`) | Only in `server/.env` / `server/data/` on the server (both git-ignored). Never sent in any response, never logged |
| **Razorpay payment verification** | Is this payment real, for our order, for the full amount? | Only on the server ([`backend/src/payments/razorpay.js`](backend/src/payments/razorpay.js)): the order (amount from the database price) is created with the secret; the browser callback counts only if `HMAC_SHA256(order_id + "|" + payment_id, RAZORPAY_KEY_SECRET)` matches; the webhook only if its body's HMAC with `RAZORPAY_WEBHOOK_SECRET` matches and the full amount was paid. Only then is the license issued or extended — once per payment |

The browser (and the apps) can never create a license, choose an amount or extend a date by themselves.


## Going live (with ads)

1. **Server**: a VPS with Node.js 20+ and MySQL 8, behind HTTPS (Caddy is the simplest). Set in
   `.env`: `NODE_ENV=production`, `PORTAL_URL=https://docgen.reynrel.in`, `TRUST_PROXY=true`,
   `DATABASE_URL`, `JWT_SECRET`, `ADMIN_*`. Back up `data/license-private-key.pem` and the database.
2. **Razorpay**: activate the account (KYC), put the API keys in `.env`, add the webhook
   (`https://<domain>/api/payments/webhook/razorpay`, events `payment.captured`, `order.paid`,
   `payment.failed`) and its secret. Test with `rzp_test_…` keys first, then switch to `rzp_live_…`.
3. **Email**: set `SMTP_URL` and `MAIL_FROM` (Zoho Mail, Google Workspace, SES, Brevo…) so customers
   get receipts and can reset forgotten passwords.
4. **Downloads**: Admin → Downloads → per platform (Windows, macOS, Linux): *Offer to customers* on/off and
   either upload the installer (`.exe`/`.msi`, `.dmg`, `.AppImage`/`.deb`) or paste a link (e.g. a GitHub
   release); *Mobile* on/off shows DocGen Mobile in the client panel, the emails and the website.
   Customers get the one for their computer first. Set "Latest version" in Admin → App settings.
5. **Desktop app**: in `document-generator/src-tauri/remote-config.json` set `serverUrl`/`portalUrl`
   to your domain and `licensePublicKey` to the key printed at server start, then build the installer
   and upload it (step 4).
6. **Prices & website**: Admin → Products & pricing (default DocGen: 1 year ₹1,250, 2 years ₹2,250,
   5 years ₹4,999; 1 computer, 2 phones — add or change durations and prices there) and
   Admin → Website (headline, screenshots, up to two YouTube/Vimeo videos). The website shows one
   pricing card per duration, each with its own plan name, duration, price and details (plan name:
   the optional name you give the price, e.g. *Premium*, otherwise Standard / Plus / Premium from short to
   long; the lowest price per year is marked *Best value*; one price = one card), a comparison of
   DocGen Desktop, DocGen Mobile, accounting software and Word/Excel templates, and an FAQ.
7. **Ads**: point them at `https://docgen.reynrel.in/?utm_source=google&utm_medium=cpc&utm_campaign=<name>`
   (Google Ads adds `gclid` by itself; Meta adds `fbclid`). Admin → Dashboard → *Where customers
   come from* shows sign-ups, paying customers, conversion and revenue per campaign.
8. **Legal pages** for Razorpay approval and ad platforms are built in: `/terms`, `/privacy`, `/shipping`,
   `/refunds` (Cancellation & Refunds) and `/contact`, linked from every page's footer. Fill in Admin → Website →
   **Business details** (legal name as in your Razorpay KYC, address, phone, support hours, court city) — the
   pages use them. Read the policies once and adjust the text in `frontend/src/pages/portal/InfoPages.jsx` if
   your terms differ (e.g. the 7-day refund window), then change `POLICIES_UPDATED` there.
9. **Help & Support**: requests from `/support`, `/contact` and the client panel appear in Admin → Support
   requests (the dashboard shows how many are waiting). Answers are emailed to the customer, so set up SMTP
   (step 3); new requests are also emailed to `SUPPORT_EMAIL`.

## Configuration (environment variables)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8787` | HTTP port for the API, portal and admin panel |
| `NODE_ENV` | — | `production` enables strict checks (JWT secret required, mock payments off, HTTPS URLs only) |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | `localhost` `3306` `root` — — | MySQL 8 (recommended in production); used when `DB_NAME` is set. The password is taken as-is |
| `DATABASE_URL` | — | alternative: `mysql://user:pass@host:3306/docgen` (encode `@ # / ? %` in the password) |
| `SQLITE_FILE` | `data/docgen.sqlite` | used when `DATABASE_URL` is empty (needs the optional `better-sqlite3`) |
| `DATA_DIR` | `server/data` | license key, installers for download, ad images, SQLite file |
| `MOBILE_DIST` | `server/mobile/dist` | built DocGen Mobile, served at `/app/` |
| `JWT_SECRET` | — | long random string for portal/admin sessions (**required in production**) |
| `LICENSE_PRIVATE_KEY` | `DATA_DIR/license-private-key.pem` | Ed25519 private key (PEM), created on first start outside production. Keep it secret and backed up — losing it means re-issuing all licenses |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | first owner admin, created when no admin exists |
| `PORTAL_URL` | `http://localhost:PORT` | public portal URL used in links |
| `CORS_ORIGINS` | — | extra allowed origins (comma separated) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | — | enable Razorpay checkout (UPI, cards, netbanking, wallets) |
| `RAZORPAY_WEBHOOK_SECRET` | — | verifies Razorpay webhooks (`/api/payments/webhook/razorpay`) |
| `SMTP_URL` / `MAIL_FROM` | — | email receipts and password-reset links (without it the portal tells customers to contact support) |
| `SUPPORT_EMAIL` | `info.reynrel@gmail.com` | shown to customers and used as reply-to |
| `ENABLE_MOCK_PAYMENTS` | off | `true` = instant fake payments for local testing (ignored in production) |
| `TRUST_PROXY` | — | `true` behind Nginx/Caddy/a load balancer (correct client IPs for rate limits) |
| `RATE_LIMITS` | on (off in tests) | `off` disables rate limiting (load tests only) |

More admins: `npm run create-admin -- other@example.com 'long password' admin` (roles: owner, admin, support).

## Production deployment

1. MySQL 8 database (utf8mb4):
   `CREATE DATABASE docgen CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`
   `CREATE USER 'docgen'@'%' IDENTIFIED BY '…'; GRANT ALL ON docgen.* TO 'docgen'@'%';`
   Then set `DATABASE_URL=mysql://docgen:…@host:3306/docgen`, `JWT_SECRET` (`openssl rand -base64 48`),
   `NODE_ENV=production`, `TRUST_PROXY=true`, `PORTAL_URL=https://docgen.example.com`.
2. `npm ci && npm run build` (or just `npm start`, which builds the frontend when needed).
3. `npm run migrate` (also runs automatically at start), then `npm start` under a process
   manager (systemd, PM2, Docker).
4. Put it behind HTTPS (Caddy/Nginx). The desktop app accepts only `https://` servers in release builds.
5. Back up the database and `DATA_DIR` (license key, uploaded installers). Production uses the existing
   `license-private-key.pem` but never generates a new one silently.
6. In `document-generator/src-tauri/remote-config.json` set `serverUrl`, `portalUrl`,
   `licensePublicKey`, then build the desktop installers.

One instance handles thousands of customers. For several instances: use MySQL, put `DATA_DIR` on shared
storage (installers, ad images), and note that rate limits are counted per instance.
Timestamps are stored as ISO-8601 UTC text, so the server's MySQL time zone does not matter.

## How licensing works

- A **license** has a unique key, a product, a customer, a status (`unused`, `active`,
  `suspended`, `revoked`; `expired` is derived from `expires_at`), a start date (`activated_at`), an expiry
  date (`expires_at`), a computer limit (`max_devices`) and a phone limit (`max_mobile_devices`).
  A license **bought on the website is valid from the payment date** for the bought duration
  (`plan_prices`: one row per product and duration, e.g. 365/730/1825 days; `0` = lifetime). The payment
  stores the price and the duration, so later price changes never alter what was paid for. Extending adds
  the duration to `max(today, expires_at)`. Codes an admin creates without a date start at the first
  activation (`duration_days`); `duration_days = 0` without an end date = lifetime.
- **Devices**: every activation is a row in `devices` with `kind` = `desktop` or `mobile`. The server
  counts active computers and phones separately (`/api/app/activate` and `/api/app/login` with
  `deviceKind`) and refuses one more than the license allows (`409 DEVICE_LIMIT`); customers free a place
  in My License, admins in Licenses. The limit is never checked only on the device.
- The desktop app works only while the license is valid: on sign-in the server checks the account
  (password, not suspended), that a paid or admin-issued license exists, its status and its end date;
  a suspended account blocks all its licenses. The app shows the remaining days in the sidebar when
  30 or fewer are left, checks the license weekly (and at every start near or after the end date), and
  an expired license locks the app until it is renewed ("I have renewed — check again").
- The desktop app signs in (`POST /api/app/login`) or activates a code (`POST /api/app/activate`)
  and receives a **signed token** (Ed25519) bound to its device ID. The app verifies it offline
  with the public key, so it works without internet.
- Payments: `POST /api/portal/checkout/start` (new customer) or `/checkout` (signed in) creates a pending payment; when the provider confirms
  (portal callback or webhook `POST /api/payments/webhook/:provider`), the payment is marked
  paid and a license is issued or extended — idempotently.
- Admins can create licenses without payment, extend, suspend, revoke, release computers, and record a
  refund (which revokes the license that payment bought).

### DocGen Mobile

[`mobile/`](mobile/) is a React app, built to `mobile/dist` and served at `/app/`. It is a Progressive Web App:
Android (Chrome: menu ⋮ → *Install and create shortcut* → *Install*), iPhone uses *Share → Add to Home
Screen*; `/mobile` explains it with screenshots, a QR code, the install button and a 4-step Android guide
with pictures (`/mobile#android`, images in `frontend/public/install/`).

- **Same features as the desktop app.** The mobile build imports the desktop app's own code from
  `document-generator/src` (see `mobile/vite.config.js`): all 18 document types, the 4 templates and renderer
  (Tally Professional, Tally Standard, Modern, Simple), the GST/decimal engine, numbering formats, amount in words,
  HSN summary, UPI QR code and the document services. Only the screens are phone-specific (bottom tabs Dashboard ·
  Documents · Products · Settings). The desktop app itself is not changed. Because of this, build the server from
  the whole repository (the `document-generator/src` folder must be present next to `server/`).
- **What is on the phone:** Dashboard (cards per document type with +, Customize, recent documents); Documents
  (search, type filter, status change, view / edit / print / duplicate / convert / cancel / delete / restore, and the
  sales CSV download); editor (saved customers and products, GSTIN → state, CGST/SGST or IGST from the place of supply,
  discounts, shipping, other charges, round off, additional details per type, receipts and payment vouchers, live
  preview); document view (template per document, Print / Save as PDF with 1–4 copies, share, history, contact the
  customer by call / WhatsApp / email); Products & Services with categories; Settings (Company with logo, signature and
  stamp, Documents, Document Types, Tax, Numbering, License, Backup, Help, About).
  Left out on the phone: uploaded files (Document Manager → Files), the Units, General (date format, sample data) and
  Currency settings, and the desktop's ads, theme switch and keyboard shortcuts. The built-in units, the default date
  format and the currency chosen at setup are used.
- **Storage:** the desktop's backend commands (Rust/SQLite on a computer) are implemented over IndexedDB in
  [`mobile/src/engine/`](mobile/src/engine/) — same allow-lists, validation messages, numbering and history. Backup
  is one JSON file (documents, products, customers, images, settings); restoring keeps a safety copy. Data saved by the first
  mobile version is converted automatically on first start.
- **License on the device**: the customer enters the license key (or email + password) once. The signed token is
  stored in IndexedDB encrypted with a non-extractable AES-GCM key (when the browser allows it); a summary (key,
  start, expiry, device id) in localStorage only for display. At every start the app verifies the token's Ed25519
  signature with the server's public key and the device id — editing localStorage does not unlock it.
- **Validation**: refreshes the license once a day when online (`/api/app/license/refresh`), works up to 30 days
  offline, locks when the license expired (or the clock was turned back) and unlocks after *Check again* once the
  license is extended. A phone removed in the client/admin panel must activate again.
- **Phone limit**: from the product (default 2) or set per license — enforced by the server.

### Testing DocGen Mobile on a phone

Phones install a web app (Android Chrome: menu ⋮ → *Install and create shortcut*; iPhone Safari: *Add to Home Screen* as an app) only
from a **secure address**: `https://…`, or `localhost` on the phone itself. The address the server prints at
start (`http://192.168.x.x:8787/app/`, same Wi-Fi) is fine for *using* DocGen Mobile, but the phone offers
no Install there and no offline mode. On the live site (`https://docgen.reynrel.in`) none of this matters. To
test installing before going live, use one of these:

1. **HTTPS tunnel** (Android and iPhone, easiest). Install Cloudflare's free `cloudflared`
   (Windows: `winget install --id Cloudflare.cloudflared`, Mac: `brew install cloudflared`), keep `npm start`
   running and in a second terminal run `cloudflared tunnel --url http://localhost:8787`. It prints an address
   like `https://some-words.trycloudflare.com` — open `…/mobile` on the phone and tap Install
   (`ngrok http 8787` works the same way).
2. **USB, Android only.** Phone: Settings → About phone → tap *Build number* 7 times → Developer options →
   *USB debugging* on; connect the cable. Computer: open `chrome://inspect/#devices` in Chrome → *Port
   forwarding…* → port `8787`, address `localhost:8787`, tick *Enable port forwarding*. Phone: open
   `http://localhost:8787/app/` in Chrome → menu ⋮ → *Install app*.

### Payment providers

Built in: `razorpay` (when its keys are set; preselected), `manual` (bank transfer/UPI — an admin
marks the payment paid in Admin → Payments) and `mock` (local testing only). Another gateway is an
object implementing `createOrder`, `verifyConfirmation` and `parseWebhook` in
`backend/src/payments/` (see `index.js` and `razorpay.js`).

## Remote configuration and ads

Admin panel → *App config*: check interval (days, default 30), ad policy (days before the
first ad, minimum days between ads, maximum per month), built-in DocGen message on/off,
latest version and download link, YouTube channel and tutorial videos.

Admin panel → *Ads*: title, description, image (HTTPS or uploaded), HTML (shown sandboxed,
scripts never run), link and button text, active, start/end, show-again-after days, maximum
per month, priority, targeting (trial/licensed, platforms, app version range). Each ad shows
anonymous shown/clicked/closed counts.

`GET /api/app/config` returns the configuration to the desktop app, which validates it
again, caches it, and checks again when the interval has passed (immediately after coming
back online if a check was missed).

## API overview

| Area | Base | Auth |
|------|------|------|
| Apps | `/api/app` — `public-key`, `config`, `events`, `login`, `activate`, `license/refresh`, `license/release` (body `deviceKind`: `desktop` default, or `mobile`) | device token for refresh/release |
| Portal | `/api/portal` — `site`, `checkout/start`, `checkout/confirm`, `support` (POST, public); `auth/login`, `auth/forgot`, `auth/reset`, `me`, `me/password`, `licenses`, `payments`, `checkout`, `downloads`, `support` (GET), `support/:id` (+ `messages`, `close`) | client JWT |
| Admin | `/api/admin` — `auth/login`, `stats`, `stats/acquisition`, `clients`, `licenses`, `plans` (products with `prices`), `payments` (+ `mark-paid`, `refund`), `support` (+ `:id`, `:id/messages`), `downloads` (+ `downloads/settings`), `site`, `ads`, `config`, `audit`, `admins`, `uploads` | admin JWT + role |

`checkout` and `checkout/start` require `acceptTerms: true` (the Terms & Conditions checkbox); the time is stored
with the payment (`terms_accepted_at`).
| Payments | `/api/payments/webhook/:provider` | provider signature |
| Downloads | `/api/downloads/<personal link>` | signed link, 30 minutes |

Errors: `{ "error": { "code": "LICENSE_EXPIRED", "message": "…" } }`. Lists are paginated
(`page`, `pageSize` ≤ 100, `q` search) and return `{ rows, total, page, pageSize, pages }`.

## Security

- Passwords: bcrypt (cost 11). Sessions: JWT (HS256; clients 7 days, admins 8 hours) invalidated on password change
  via `token_version`. Admin roles: owner / admin / support.
- Rate limits per IP: 30 sign-in/registration/activation attempts per 15 min; 60 desktop
  requests per minute; 12 Help & Support messages per hour (plus a hidden spam-trap field); 600 API requests per minute.
- Input validation with zod on every endpoint; body limit 100 KB; uploads: images ≤ 2 MB, installers ≤ 600 MB (admins only).
- Payments: amount fixed by the server, HMAC-verified callbacks/webhooks, one license per payment,
  underpaid webhooks never issue a license. Password-reset links expire after 1 hour and work once.
- helmet with a strict CSP for the portal; CORS limited to the portal origin and `CORS_ORIGINS`.
- Audit log of admin and licensing actions. No business data from the desktop app is ever received.

## Tests

```bash
npm test                     # API + customer-journey tests (SQLite); TEST_DATABASE_URL=mysql://… runs them on MySQL
npm run test:portal          # browser test: ad → product page → duration → checkout → Razorpay (simulated) → license, download,
                             #   extend, phones, client panel at phone width → admin (prices, downloads, licenses …)
npm run test:mobile          # browser test of DocGen Mobile in a phone-sized window: install page, activation, setup, invoices
                             #   in the 4 templates, convert / cancel / delete / restore, sales CSV, products, settings,
                             #   backup, offline, phone limit, expiry lock, data from the first mobile version
npm run loadtest             # seeds 10,000 clients + licenses, measures key endpoints (LOAD_CLIENTS=…)
npm run seed:load -- 10000   # seed an existing (test!) database
```

Results are in [`../TESTING.md`](../TESTING.md).
