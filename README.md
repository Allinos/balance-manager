# Balance Manager

> **Also in this repository:** [`document-generator/`](document-generator/) — **DocGen**, a
> lightweight offline desktop app (Tauri 2 + React + SQLite) for creating invoices,
> quotations, orders, challans, notes and receipts. See its
> [README](document-generator/README.md).


A daily **collection, deposit and DMS reconciliation** manager built with
**Node.js + Express + MySQL + EJS**. It digitises the spreadsheet workflow of
tracking daily online/cash/credit collections, bank deposits, a running balance
ledger, and DMS deposit reconciliation — with role-based login, a responsive
admin dashboard, reports, exports, user management and audit logs.

---

## ✨ Features

- **Authentication & role-based access** (admin / manager / operator / viewer)
- **Dashboard** with summary cards + Chart.js charts (collections vs deposits, collection mix)
- **Daily Collection CRUD** with auto-calculated totals + online/cash/credit summary
- **Deposit CRUD** (Bank / Online / Cash / Cheque) with a managed "Deposit By" list
- **Running balance ledger** — opening/remaining balance recomputed automatically
- **Simple DMS deposits** (date, payment mode, account, amount, status, deposit by) that
  automatically deduct from the running balance / available cash
- **Settings** — admin-managed lists of depositors and accounts
- **Reports** with date filters and **Excel + PDF export**
- **User management** (admin only)
- **Audit logs** of every create/update/delete/login/export
- **Responsive UI** for mobile & desktop

---

## 🧮 Business rules / calculations

| Field | Formula |
|-------|---------|
| **Total Collection** | `Online + Cash + Credit Balance` |
| **Opening Balance** | Previous day's **Remaining Balance** |
| **Remaining Balance** | `Opening Balance + Total Collection + Old Balance Collection − Deposits − DMS Deposits` |
| **Available Cash** | `Opening Cash + Cash Collection − Cash-source Deposits (Cash/Bank) − Cash-mode DMS` |
| **Available Online** | `Opening Online + Online Collection − Online-source Deposits (Online/Cheque) − Online-mode DMS` |
| **DMS Deposit** | Outflow. `Cash` mode reduces Available Cash; `Online` mode reduces Available Online. Both reduce the overall balance. |
| **Account Balance** | `Σ DMS deposits into that account` — the running total held in each account |

### Date filters

Reports, Deposits, Collections and the Dashboard share a standard date filter with
**All / Today / Yesterday / Last 7 Days / Last 30 Days / Custom range** presets.
The selected range updates all records, totals and analytics on the page.

The ledger is recalculated end-to-end (in date order) whenever a collection or
deposit is created, edited or deleted, so opening/remaining balances always stay
consistent. See `src/services/ledger.service.js`.

---

## 🗂 Folder structure

```
balance-manager/
├── server.js                 # entry point (DB ping + start)
├── package.json
├── .env.example
├── public/                   # static assets served at /static
│   ├── css/style.css
│   └── js/app.js
├── views/                    # EJS templates
│   ├── layouts/              # main + auth layouts
│   ├── partials/             # sidebar, topbar, flash, date-filter
│   ├── auth/ dashboard/ collections/ deposits/ dms/
│   ├── reports/ users/ audit/ errors/
└── src/
    ├── app.js                # express app wiring
    ├── config/               # env + mysql pool
    ├── database/             # schema.sql, init.js, seed.js
    ├── models/               # data access (mysql2)
    ├── services/             # ledger, reports (xlsx/pdf), audit
    ├── controllers/          # request handlers
    ├── routes/               # web + api routes
    ├── middleware/           # auth, validate, error
    ├── validators/           # express-validator rules
    └── utils/                # money, date, asyncHandler
```

---

## 🚀 Getting started

### 1. Prerequisites
- Node.js ≥ 18
- MySQL ≥ 5.7 / 8.x running locally

### 2. Install
```bash
npm install
cp .env.example .env
# edit .env with your MySQL credentials
```

### 3. Create the database & schema
```bash
npm run db:init
```

### 4. Seed demo data (users + sample July collections)
```bash
npm run db:seed
```

### 5. Run
```bash
npm run dev      # with auto-reload (nodemon)
# or
npm start
```
Open <http://localhost:3000>.

> Tip: `npm run db:reset` re-creates the schema and re-seeds in one step.

### Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@example.com` | `Admin@123` |
| Manager | `manager@example.com` | `Demo@123` |
| Operator | `operator@example.com` | `Demo@123` |

(Admin credentials are configurable via `SEED_ADMIN_*` in `.env`.)

---

## 🔐 Roles & permissions

| Capability | viewer | operator | manager | admin |
|------------|:------:|:--------:|:-------:|:-----:|
| View dashboards / lists / reports | ✅ | ✅ | ✅ | ✅ |
| Create / edit collections, deposits, DMS | | ✅ | ✅ | ✅ |
| Delete records | | | ✅ | ✅ |
| Export reports | | ✅ | ✅ | ✅ |
| Manage users & settings (depositors/accounts) | | | | ✅ |
| View audit logs | | | | ✅ |

---

## 🌐 API endpoints

Session-protected JSON API (used by the dashboard charts / integrations):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard?start=&end=` | Chart series (total, deposits, remaining) |
| GET | `/api/collections?start=&end=` | Collections ledger |
| GET | `/api/deposits?start=&end=` | Deposits |
| GET | `/api/dms?start=&end=&status=` | DMS records |

Web CRUD routes: `/collections`, `/deposits`, `/dms`, `/users` (REST-ish with
`method-override` for `PUT`/`DELETE`), plus `/reports/export/excel` and
`/reports/export/pdf`.

---

## 🗄 Database schema

Five tables (see `src/database/schema.sql`):

- **users** – accounts, hashed passwords (bcrypt), role enum
- **collections** – one row per collection date (unique), stored + derived amounts
- **deposits** – deposits keyed by date, linked to the ledger by date
- **dms_deposits** – date, payment mode (Cash/Online), account, amount, status
- **depositors** / **accounts** – managed lists for the Deposit By / Account selects
- **audit_logs** – who did what, when, with JSON detail

---

## ✅ Validation

All write endpoints are validated with **express-validator**
(`src/validators/*`): required dates, non-negative amounts, deposit amount > 0,
valid enums for mode/role/status, email format & password length for users.
Invalid submissions are re-rendered with flash error messages.

---

## 📤 Exports

- **Excel** — multi-sheet workbook (Collections, Deposits, DMS) via `exceljs`
- **PDF** — landscape summary via `pdfkit`

Both respect the selected `start`/`end` date range.

---

## 📝 Notes

- Charts load Chart.js from a CDN in `views/layouts/main.ejs`. If you need a
  fully offline build, download `chart.umd.min.js` into `public/vendor/` and
  update the `<script>` tag.
- The original spreadsheet's *Total* column appeared to be `Online + Cash`;
  this app follows the requested rule **`Total = Online + Cash + Credit Balance`**.
  Adjust `computeTotal()` in `src/services/ledger.service.js` if your definition
  differs.

## License

MIT
