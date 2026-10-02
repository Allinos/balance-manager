# DocGen server

Backend API for the DocGen desktop app ([`backend/`](backend/)) **plus** the client portal and admin panel
([`frontend/`](frontend/)) — run together as one Node.js application on **one port** (default `8787`).
One `npm install` in this folder installs both (npm workspaces).

- **Sales funnel**: product page (one product, one price) → name, mobile, email → payment (Razorpay:
  UPI, cards, netbanking, wallets) → account created and signed in → license code + **download**.
  Ad clicks (UTM tags, Google `gclid`, Facebook `fbclid`) are tracked per customer and reported per campaign.
- **Client panel**: license status, remaining validity, license code, download, computers, purchases,
  renew; password (created after the purchase), forgotten password by email.
- **Products, payments, licenses**: price, license validity (default 1 year) and computers are set in the
  admin panel; license codes (`AB12-CD34-EF56`), renewals; email with the code, validity and download links.
- **Desktop API**: account sign-in, code activation, license refresh/release, remote
  configuration (check interval, ads, help videos), anonymous ad counters.
- **Admin panel**: dashboard (sales this month, revenue, recent sales, licenses ending soon, ad campaigns),
  customers, payments (mark paid, refund), licenses (give without payment, bulk codes, extend, suspend,
  revoke), products & pricing, downloads (installers), website content (headline, screenshots, videos),
  desktop app settings, in-app ads, activity log.
- Serves the React **portal/admin** (`frontend/`) on the same port: `/` portal, `/admin` admin panel, `/api` API.

Stack: Node.js 20+, Express 5, Knex (MySQL 8 in production, SQLite for development),
bcrypt, JWT sessions, zod validation, rate limits, helmet.

## Quick start

```bash
cd server
npm install                 # better-sqlite3 is optional; if it cannot be built, install still succeeds
cp .env.example .env        # Windows: copy .env.example .env   — then edit DB_*, ADMIN_*, JWT_SECRET
npm start                   # builds the portal if needed, then API + portal + admin on http://localhost:8787
```

| Command | What it does |
|---------|--------------|
| `npm start` | builds `frontend/dist` when the frontend sources changed, then serves everything on `PORT` |
| `npm run dev` | same port; the frontend is served live from `frontend/src` (instant reload) and the API restarts on changes |
| `npm run build` | builds `frontend/dist` |
| `npm test` / `npm run test:portal` | API tests / browser end-to-end test of the portal and admin panel |

Folder layout:

```
server/
├── package.json    workspace root — run all npm commands here
├── .env            your settings (copy .env.example)
├── backend/        API (Express)
│   ├── src/        routes, services, payments, migrations
│   ├── scripts/    migrate, create-admin, build-portal, load test …
│   └── test/       API tests
├── frontend/       client portal + admin panel (React + Vite) → frontend/dist
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
`/forgot-password`, `/account` (client panel).

## Architecture

```
 Ad (Google / Meta / …)                         DocGen desktop app (customer's PC)
        │  https://docgen.reynrel.in/?utm_…            │ /api/app: sign in, activate, refresh,
        ▼                                              │ config & in-app ads (no business data)
 ┌───────────────────────────── one Node.js process, one port ─────────────────────────────┐
 │ frontend/ (React SPA)            backend/ (Express 5)                                    │
 │  /            product page        /api/portal  site, checkout, account, licenses, downloads│
 │  /buy, /login, /account           /api/admin   admin panel API                            │
 │  /admin       admin panel         /api/app     desktop app API                            │
 │                                   /api/payments/webhook/razorpay   /api/downloads/<link>  │
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
3. **Pay.** The server creates a Razorpay order for the product price — the browser never decides the
   amount. The payment counts only with a valid Razorpay signature (browser callback) or signed
   webhook with the full amount. Webhook and callback arriving together issue **one** license
   (row lock). Test payments are impossible unless `ENABLE_MOCK_PAYMENTS=true` outside production.
4. **Account + license + email.** After payment the customer is signed in automatically and sees the
   license code (valid 1 year from today by default), validity and Download button. The email has the
   code, the end date, download links (7 days) and a link to create a password (7 days).
   Renewing from the client panel adds the product's period to the end date of the same license.
5. **Download.** Only customers with an active license can download. Links are personal (30 minutes on
   the website, 7 days in the email) and always serve the latest uploaded installer.
6. **Activate.** The desktop app takes the license code (or the email + password) and gets a
   signed, device-bound license token that works offline.

## Going live (with ads)

1. **Server**: a VPS with Node.js 20+ and MySQL 8, behind HTTPS (Caddy is the simplest). Set in
   `.env`: `NODE_ENV=production`, `PORTAL_URL=https://docgen.reynrel.in`, `TRUST_PROXY=true`,
   `DATABASE_URL`, `JWT_SECRET`, `ADMIN_*`. Back up `data/license-private-key.pem` and the database.
2. **Razorpay**: activate the account (KYC), put the API keys in `.env`, add the webhook
   (`https://<domain>/api/payments/webhook/razorpay`, events `payment.captured`, `order.paid`,
   `payment.failed`) and its secret. Test with `rzp_test_…` keys first, then switch to `rzp_live_…`.
3. **Email**: set `SMTP_URL` and `MAIL_FROM` (Zoho Mail, Google Workspace, SES, Brevo…) so customers
   get receipts and can reset forgotten passwords.
4. **Installer**: Admin → Downloads → upload the Windows `.exe` and the macOS `.dmg` (both from the
   "DocGen latest build" release); customers get the one for their computer first.
   Set "Latest version" in Admin → App settings.
5. **Desktop app**: in `document-generator/src-tauri/remote-config.json` set `serverUrl`/`portalUrl`
   to your domain and `licensePublicKey` to the key printed at server start, then build the installer
   and upload it (step 4).
6. **Price & website**: Admin → Products & pricing (default DocGen, ₹1,250 one-time, 1-year license) and
   Admin → Website (headline, screenshots, up to two YouTube/Vimeo videos).
7. **Ads**: point them at `https://docgen.reynrel.in/?utm_source=google&utm_medium=cpc&utm_campaign=<name>`
   (Google Ads adds `gclid` by itself; Meta adds `fbclid`). Admin → Dashboard → *Where customers
   come from* shows sign-ups, paying customers, conversion and revenue per campaign.
8. **Legal pages** for Razorpay approval and ad platforms: privacy policy, terms, refund/cancellation
   policy and contact details — publish them on reynrel.in and link them from your ads/site.

## Configuration (environment variables)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8787` | HTTP port for the API, portal and admin panel |
| `NODE_ENV` | — | `production` enables strict checks (JWT secret required, mock payments off, HTTPS URLs only) |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | `localhost` `3306` `root` — — | MySQL 8 (recommended in production); used when `DB_NAME` is set. The password is taken as-is |
| `DATABASE_URL` | — | alternative: `mysql://user:pass@host:3306/docgen` (encode `@ # / ? %` in the password) |
| `SQLITE_FILE` | `data/docgen.sqlite` | used when `DATABASE_URL` is empty (needs the optional `better-sqlite3`) |
| `DATA_DIR` | `server/data` | license key, installers for download, ad images, SQLite file |
| `JWT_SECRET` | — | long random string for portal/admin sessions (**required in production**) |
| `LICENSE_PRIVATE_KEY` | `DATA_DIR/license-private-key.pem` | Ed25519 private key (PEM), created on first start outside production. Keep it secret and backed up — losing it means re-issuing all licenses |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | first owner admin, created when no admin exists |
| `PORTAL_URL` | `http://localhost:PORT` | public portal URL used in links |
| `CORS_ORIGINS` | — | extra allowed origins (comma separated) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | — | enable Razorpay checkout (UPI, cards, netbanking, wallets) |
| `RAZORPAY_WEBHOOK_SECRET` | — | verifies Razorpay webhooks (`/api/payments/webhook/razorpay`) |
| `SMTP_URL` / `MAIL_FROM` | — | email receipts and password-reset links (without it the portal tells customers to contact support) |
| `SUPPORT_EMAIL` | `support@reynrel.in` | shown to customers and used as reply-to |
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

- A **license** has a unique code, a product, a status (`unused`, `active`,
  `suspended`, `revoked`; `expired` is derived from `expires_at`), a computer limit and a validity.
  A license **bought on the website is valid from the payment date** for the product's period
  (Admin → Products & pricing, default 365 days). Codes an admin creates without a date start at the
  first activation (`duration_days`); `duration_days = 0` without an end date = lifetime.
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
| Desktop | `/api/app` — `public-key`, `config`, `events`, `login`, `activate`, `license/refresh`, `license/release` | device token for refresh/release |
| Portal | `/api/portal` — `site`, `checkout/start`, `checkout/confirm` (public); `auth/login`, `auth/forgot`, `auth/reset`, `me`, `me/password`, `licenses`, `payments`, `checkout`, `downloads` | client JWT |
| Admin | `/api/admin` — `auth/login`, `stats`, `stats/acquisition`, `clients`, `licenses`, `plans` (products), `payments` (+ `mark-paid`, `refund`), `downloads`, `site`, `ads`, `config`, `audit`, `admins`, `uploads` | admin JWT + role |
| Payments | `/api/payments/webhook/:provider` | provider signature |
| Downloads | `/api/downloads/<personal link>` | signed link, 30 minutes |

Errors: `{ "error": { "code": "LICENSE_EXPIRED", "message": "…" } }`. Lists are paginated
(`page`, `pageSize` ≤ 100, `q` search) and return `{ rows, total, page, pageSize, pages }`.

## Security

- Passwords: bcrypt (cost 11). Sessions: JWT (HS256; clients 7 days, admins 8 hours) invalidated on password change
  via `token_version`. Admin roles: owner / admin / support.
- Rate limits per IP: 30 sign-in/registration/activation attempts per 15 min; 60 desktop
  requests per minute; 600 API requests per minute.
- Input validation with zod on every endpoint; body limit 100 KB; uploads: images ≤ 2 MB, installers ≤ 600 MB (admins only).
- Payments: amount fixed by the server, HMAC-verified callbacks/webhooks, one license per payment,
  underpaid webhooks never issue a license. Password-reset links expire after 1 hour and work once.
- helmet with a strict CSP for the portal; CORS limited to the portal origin and `CORS_ORIGINS`.
- Audit log of admin and licensing actions. No business data from the desktop app is ever received.

## Tests

```bash
npm test                     # API + customer-journey tests (SQLite); TEST_DATABASE_URL=mysql://… runs them on MySQL
npm run test:portal          # browser test: ad → product page → checkout → Razorpay (simulated) → license, download → admin
npm run loadtest             # seeds 10,000 clients + licenses, measures key endpoints (LOAD_CLIENTS=…)
npm run seed:load -- 10000   # seed an existing (test!) database
```

Results are in [`../TESTING.md`](../TESTING.md).
