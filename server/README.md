# DocGen server

Backend for the DocGen desktop app, the client portal and the admin panel.

- **Client accounts**: registration, sign-in, business details, password change.
- **Plans, payments, licenses**: checkout through a pluggable payment provider, activation
  codes (`AB12-CD34-EF56`), validity, device limits, renewals and extensions.
- **Desktop API**: account sign-in, code activation, license refresh/release, remote
  configuration (check interval, ads, help videos), anonymous ad counters.
- **Admin API**: clients, licenses (manual activation without payment, bulk codes, extend,
  suspend), plans, payments (mark paid), ads, app configuration, audit log, statistics.
- Serves the React **portal/admin** (`../portal/dist`) from the same origin.

Stack: Node.js 20+, Express 5, Knex (MySQL 8 in production, SQLite for development),
bcrypt, JWT sessions, zod validation, rate limits, helmet.

## Quick start (development)

```bash
cd server
npm install
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='change-me-now' npm run dev   # http://localhost:8787
cd ../portal && npm install && npm run dev                                 # http://localhost:5173 (proxies /api)
```

On first start the server creates `data/` with the SQLite database and the **license signing
key** and prints the **license public key** — put it into
`document-generator/src-tauri/remote-config.json → licensePublicKey`.

Admin panel: `/admin/login`. Client portal: `/` (plans), `/register`, `/login`, `/account`.

## Configuration (environment variables)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8787` | HTTP port |
| `NODE_ENV` | — | `production` enables strict checks (JWT secret required, mock payments off, HTTPS URLs only) |
| `DATABASE_URL` | — | `mysql://user:pass@host:3306/docgen` — MySQL 8 (recommended in production) |
| `SQLITE_FILE` | `data/docgen.sqlite` | used when `DATABASE_URL` is empty |
| `DATA_DIR` | `./data` | keys, uploads (ad images), SQLite file |
| `JWT_SECRET` | — | long random string for portal/admin sessions (**required in production**) |
| `LICENSE_PRIVATE_KEY` | generated in `DATA_DIR` | Ed25519 private key (PEM). Keep it secret and backed up — losing it means re-issuing all licenses |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | first owner admin, created when no admin exists |
| `PORTAL_URL` | `http://localhost:PORT` | public portal URL used in links |
| `CORS_ORIGINS` | — | extra allowed origins (comma separated) |
| `ENABLE_MOCK_PAYMENTS` | on outside production | instant test payments |
| `TRUST_PROXY` | — | `true` behind Nginx/Caddy/a load balancer (correct client IPs for rate limits) |
| `RATE_LIMITS` | on (off in tests) | `off` disables rate limiting (load tests only) |

More admins: `npm run create-admin -- other@example.com 'long password' admin` (roles: owner, admin, support).

## Production deployment

1. MySQL 8 database (utf8mb4):
   `CREATE DATABASE docgen CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`
   `CREATE USER 'docgen'@'%' IDENTIFIED BY '…'; GRANT ALL ON docgen.* TO 'docgen'@'%';`
   Then set `DATABASE_URL=mysql://docgen:…@host:3306/docgen`, `JWT_SECRET` (`openssl rand -base64 48`),
   `NODE_ENV=production`, `TRUST_PROXY=true`, `PORTAL_URL=https://docgen.example.com`.
2. `npm ci --omit=dev && (cd ../portal && npm ci && npm run build)`.
3. `npm run migrate` (also runs automatically at start), then `npm start` under a process
   manager (systemd, PM2, Docker).
4. Put it behind HTTPS (Caddy/Nginx). The desktop app accepts only `https://` servers in release builds.
5. Back up the database and `DATA_DIR/license-private-key.pem` (or the `LICENSE_PRIVATE_KEY` value).
6. In `document-generator/src-tauri/remote-config.json` set `serverUrl`, `portalUrl`,
   `licensePublicKey`, then build the desktop installers.

Everything scales horizontally except the SQLite mode: use MySQL for more than one instance.
Timestamps are stored as ISO-8601 UTC text, so the server's MySQL time zone does not matter.

## How licensing works

- A **license** has a unique activation code, a plan, a status (`unused`, `active`,
  `suspended`, `revoked`; `expired` is derived from `expires_at`), a device limit and a validity.
  Validity starts at the first activation (`duration_days`), or at a fixed `expires_at`;
  `duration_days = 0` without an end date = lifetime.
- The desktop app signs in (`POST /api/app/login`) or activates a code (`POST /api/app/activate`)
  and receives a **signed token** (Ed25519) bound to its device ID. The app verifies it offline
  with the public key, so it works without internet; it refreshes it on the configuration schedule.
- Payments: `POST /api/portal/checkout` creates a pending payment; when the provider confirms
  (portal callback or webhook `POST /api/payments/webhook/:provider`), the payment is marked
  paid and a license is issued or extended — idempotently.
- Admins can create and activate licenses without payment, extend, suspend, revoke, release devices.

### Connecting a payment provider

Add an object to `src/payments/index.js` implementing `createOrder`, `verifyConfirmation`
and `parseWebhook` (see the comment at the top of that file) and register it. The portal
shows every enabled provider at checkout. Built in: `mock` (testing) and `manual`
(bank transfer/UPI — an admin marks the payment paid).

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
| Portal | `/api/portal` — `auth/register`, `auth/login`, `me`, `me/password`, `plans`, `licenses`, `payments`, `checkout` | client JWT |
| Admin | `/api/admin` — `auth/login`, `stats`, `clients`, `licenses`, `plans`, `payments`, `ads`, `config`, `audit`, `admins`, `uploads` | admin JWT + role |
| Payments | `/api/payments/webhook/:provider` | provider signature |

Errors: `{ "error": { "code": "LICENSE_EXPIRED", "message": "…" } }`. Lists are paginated
(`page`, `pageSize` ≤ 100, `q` search) and return `{ rows, total, page, pageSize, pages }`.

## Security

- Passwords: bcrypt (cost 11). Sessions: JWT (HS256; clients 7 days, admins 8 hours) invalidated on password change
  via `token_version`. Admin roles: owner / admin / support.
- Rate limits per IP: 30 sign-in/registration/activation attempts per 15 min; 60 desktop
  requests per minute; 600 API requests per minute.
- Input validation with zod on every endpoint; body limit 100 KB; uploads: images ≤ 2 MB.
- helmet with a strict CSP for the portal; CORS limited to the portal origin and `CORS_ORIGINS`.
- Audit log of admin and licensing actions. No business data from the desktop app is ever received.

## Tests

```bash
npm test                     # API tests (SQLite); TEST_DATABASE_URL=mysql://… runs them on MySQL
npm run loadtest             # seeds 10,000 clients + licenses, measures key endpoints (LOAD_CLIENTS=…)
npm run seed:load -- 10000   # seed an existing (test!) database
```

Results are in [`../TESTING.md`](../TESTING.md).
