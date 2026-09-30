# DocGen

**Create. Manage. Grow.** — a lightweight, offline-first business document generator for
small businesses, by [reynrel.in](https://reynrel.in).

| Part | Folder | Stack |
|------|--------|-------|
| Desktop app (Windows, macOS, Linux) | [`document-generator/`](document-generator/) | Tauri 2, React (JavaScript), SQLite |
| Server: license & configuration API + client portal + admin panel (one port) | [`server/`](server/) (portal in [`server/portal/`](server/portal/)) | Node.js, Express 5, MySQL 8 (SQLite for development); React + Vite |

- **Desktop**: GST invoices (Tally-style and other templates), quotations, orders, challans,
  notes, receipts, work orders; Dashboard with document counts; Document Manager with uploaded
  files; 30 days to try, then account login or license; works fully offline.
- **Server**: client accounts, plans, payments (provider-ready), activation codes and licenses,
  devices, remote app configuration and ads, admin API, audit log.
- **Portal**: clients register, add business details, buy/renew a plan, see activation codes,
  devices and payments. Admins manage clients, licenses, plans, payments, ads and app configuration.

![Tally Professional invoice](document-generator/docs/screenshots/09-invoice-tally-pro.png)

## Getting started

```bash
# 1. Server + portal + admin panel, all on http://localhost:8787 (admin at /admin/login).
#    Creates data/ and prints the license public key.
cd server && npm install
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='change-me-now' npm start   # or npm run dev (live reload)

# 2. Desktop app
cd document-generator && npm install
DOCGEN_SERVER_URL=http://localhost:8787 DOCGEN_PORTAL_URL=http://localhost:8787 \
DOCGEN_LICENSE_PUBLIC_KEY=<key from step 1> npm run app:dev
```

Without a server the desktop app runs as a fully offline build (30 days + built-in messages only).

Windows installers are built by GitHub Actions (`.github/workflows/docgen-windows.yml`) and
published on the *DocGen latest build* release — no local Visual Studio needed.

## Documentation

- [Desktop app](document-generator/README.md): features, configuration, data, document types, build
- [Server](server/README.md): configuration, deployment, licensing, payments, ads, API, security
- [Portal & admin panel](server/portal/README.md)
- [Test results](TESTING.md): unit, API, end-to-end and performance
