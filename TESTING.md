# DocGen — test results

Last full run: **29 September 2026** (after keyboard data entry, the bug-fix & UI round and the move to MySQL), branch `claude/focused-darwin-2j53b8`.

| Suite | Command | Result |
|-------|---------|--------|
| Desktop JS unit tests | `cd document-generator && npm test` | **20 / 20 passed** |
| Desktop Rust tests | `npm run test:rust` | **15 / 15 passed** |
| Desktop lint + production build | `npx eslint . && npx vite build` | clean |
| Desktop end-to-end (real app + real server) | `xvfb-run -a node e2e/run.mjs` | **160 / 160 checks passed** (two consecutive runs) |
| Server API tests (SQLite) | `cd server && npm test` | **20 / 20 passed** (19 API + 1 rate-limit) |
| Server API tests (MySQL 8.0) | `TEST_DATABASE_URL=mysql://… node --test test/api.test.js` | **19 / 19 passed** |
| Portal + admin end-to-end (Chromium) | `cd portal && node e2e/portal.e2e.mjs` (SQLite and `DATABASE_URL=mysql://…`) | **14 / 14 passed** on both |
| Server load test (SQLite and MySQL 8.0) | `npm run loadtest` | 0 errors, see below |
| Windows installer build (GitHub Actions) | `docgen-windows.yml` | build + unit tests passed (Windows-only PDF code compiles) |

Test machine: Linux container, 4 vCPU, 15 GB RAM, Node 22, WebKitGTK (the Linux webview).
Numbers on a normal office PC are similar or better; the server figures are for a single
Node process.

---

## 1. Desktop end-to-end (160 checks)

`document-generator/e2e/run.mjs` drives the **real debug binary** through WebDriver
(tauri-driver) against a **real local server** (`server/`, fresh database, seeded by the
admin API). Screenshots are saved to `document-generator/e2e/screenshots/`.

| # | Phase | Checks | What is verified |
|---|-------|-------:|------------------|
| 1 | First launch | 13 | welcome with name + tagline; GSTIN `27…` fills Maharashtra; state list shows 10 + "type to search", filters on typing; activation shows **only two cards** (Login Using Your Account · OR · I Have a License) and **Skip**, no input fields and no trial wording; login card → Email/User ID, Password, Sign In, Create Account; license card → code auto-formats to `AB12-CD34-EF56`, Activate; **Skip opens the Dashboard**; sidebar shows only a **thin green line + "30 Days"** |
| 2 | Server config + HTML ad | 8 | config fetched and cached; next check **+30 days** (server interval); remote ad shown; HTML in `sandbox=""` frame with opaque origin, its `<script>` did not run; non-blocking corner card; local counters; anonymous shown/closed counts reached the server |
| 3 | Layout & Help | 11 | new DocGen logo (square, not stretched) + name in brand colours (Doc blue, Gen orange) + tagline, "A product of reynrel.in", nav Dashboard · Document Manager · Products & Services · Customers & Vendors, Help & Settings at the bottom; sidebar collapses to icons and expands; **light theme by default**; Help lists tutorial videos from the server; guides; help search |
| 4 | Tally Professional invoice | 25 | GST picked in the **searchable GST select**; **? help** beside Round Off opens a short explanation and closes with Esc; created from the Dashboard **+**; customer GSTIN → Karnataka; place of supply follows; unit from the searchable unit list; additional details; inter-state → **IGST 18 % = 9,000**, total 59,000; printed invoice contains title, ORIGINAL FOR RECIPIENT, both GSTINs, **state names with codes 27/29**, order/vehicle no., HSN/SAC column and **HSN summary**, amount and **tax amount in words**, E. & O.E, reverse-charge line, declaration, "for Sharma Furniture Works", Authorised Signatory |
| 5 | Preview actions | 6 | **Download PDF** without a print dialog (valid `%PDF`); template switcher renders **Tally Standard, Modern, Simple, Tally Professional** from the same data; history |
| 6 | Document Manager | 20 | **saved client picked with one click** (list closes, details filled, “Save this customer” prompt removed; it returns only when details are edited); **Round Off radio directly above Grand Total** (Yes 26,553.00 / No 26,552.95); **compact summary card** with icons and status pills; **type filter next to Search**; **+ New Document** opens the chooser; quotation statuses Draft/Sent/Accepted/Rejected/Cancelled; **pencil → Accepted saves immediately** and persists; **no folder panel, filters or create strip**; **one compact summary line** (Total · This Month · Files · per status); search by product; **Cancel Invoice** asks for a reason → CANCELLED mark, editing disabled, reason in history, invoice **kept, not deleted** |
| 7 | External documents + Dashboard | 8 | Dashboard: **8 cards in exactly two rows**, **round + button** (34 px circle); **Customize** adds/removes cards and keeps two rows; **Add External Document** stores a PDF and an image, listed under Files, counted in the summary; delete → Deleted → restore; Dashboard cards show **type + count** (Invoices 1, Quotations 1) with **+**; **Recent Documents** listed |
| 8 | Settings, products, copies | 14 | custom unit "Crate" saved and listed first; **Customers & Vendors removed from the navigation** while saved customer data is kept; product form: **HSN/SAC and GST on one row (50/50)**, GST from the searchable select, **service units listed first for services**, Esc closes only the dropdown; **Triple Copy** → three copies labelled Original for Recipient / Duplicate for Transporter / Triplicate for Supplier, print-only extra copies, **downloaded PDF has 3 pages**; four templates in settings; About shows interval / last / next check |
| 8b | Keyboard data entry | 26 | a whole invoice and a product entered **without the mouse**: new invoice starts in the customer name; **Enter → next field**, **↑ → previous**; Enter in an empty field moves on; Enter inside the address adds a line, **Enter twice leaves it** (no stray blank line); Phone → Email → GSTIN → State; state dropdown: **Enter opens, type “maha”, Enter chooses and moves on**; item name → HSN → quantity (value selected, typing replaces) → unit (Enter, Enter keeps “Nos”) → rate → discount → GST → **Add Item** → Enter starts a new row → Enter on the empty name leaves the item list; totals 3 × 1,000 + 18 % = 3,540; saved with **Ctrl+S**; product dialog starts in Name, Enter through every field (dropdown values kept), **Enter on the last field saves** |
| 9 | Account sign-in | 4 | wrong password → clear message; sign-in → licensed (plan shown, day line hidden); server registered the computer; sign out → not activated |
| 10 | Check schedule | 2 | restart → **no new check before due**; the same ad is not repeated |
| 11 | 30 days ended | 5 | clock +31 days → app opens with **one activation popup**: "Your 30-day period has ended", the two cards, no Skip, "You can request through email or call for extending your time."; **cannot be dismissed** (no close button, Esc ignored); overdue monthly check runs; **activation code** closes the popup |
| 12 | Server offline | 3 | clock +62 days, server stopped → license works offline; failed attempt recorded, cached config kept; help videos still shown |
| 13 | Server back | 2 | clock +63 days → check succeeds and is **rescheduled 30 days later** |
| 14 | License expired | 1 | admin sets the end date to yesterday → "Check license now" → popup "Your DocGen license has expired" |
| 15 | Offline build | 6 | no server configured → login form says the license server is not connected; no ad on day 1; **built-in DocGen message after ~15 days**, its button opens License & Account; not repeated within 15 days; **setting the clock back does not extend the 30 days** |
| 16 | 20,000 documents | 6 | see performance below |

## 2. Desktop performance (20,000 documents)

20,000 documents with items were inserted into the app database (5 types, 700 products),
then the app was restarted.

| Measurement | Result |
|-------------|--------|
| Document Manager opens (list + summary + folders) | **~0.7 s** |
| Search "Customer 19999" (number/party/product LIKE search) | **~0.2 s** incl. WebDriver round-trip |
| Last page (offset 19,950) | **20 ms** |

Supported by indexes on type, date, status, party, folder, `(deleted_at, issue_date, id)`,
item names, and paging (50 rows per page, "Load more").

## 2b. UI review (window widths 1366, 1024 and 960 px — the app's minimum)

Checked Dashboard, Document Manager, editor (form and totals), product form, Settings →
Documents and the document view at each width; the review script also checks that nothing
overflows horizontally (none found). Issues found and fixed in this round:

| Issue | Fix |
|-------|-----|
| Dialogs moved focus to their first button, so the product dialog opened on the Product/Service toggle instead of Name | dialogs keep a field that focused itself, otherwise start in the first input |
| Esc inside a dropdown in a dialog closed the whole dialog | dialogs let an open dropdown / suggestion list / help tip close first (e2e check) |
| Choosing a saved client needed a second click (the suggestion list re-opened) | the chosen value no longer triggers a new search; affects all name/product pickers |
| Dashboard card titles cut off ("Proforma…") with five columns | icon and round **+** on top, title and count below |
| Native dropdowns (e.g. "Price is") looked different from the searchable selects | same white field and chevron everywhere |
| At 960 px the 30-day green line disappeared in the icon sidebar | line and days stack vertically |
| Recent Documents columns shifted when an amount was "—" | fixed column widths |
| Tax field truncated ("CGST + SGST (same st…") | short labels, explanation moved to **?** |
| "Leave empty for automatic numbering" hint pushed the first form row out of line | moved into **?** help |

The downloaded 3-copy PDF was rendered page by page: A4, copy label per page
(Original / Duplicate / Triplicate), Tally grid lines unbroken, CANCELLED mark kept.

## 3. Server load test (10,000 clients + licenses)

`npm run loadtest` seeds 10,000 clients with licenses and devices, then measures each
endpoint. Rate limits are disabled for this run only (they are verified by
`test/ratelimit.test.js`).

| Endpoint | Concurrency | SQLite req/s · p50 · p95 | MySQL 8.0 req/s · p50 · p95 |
|----------|------------:|--------------------------|---------------------------------|
| `GET /api/app/config` (desktop check) | 50 | 723 · 62 ms · 86 ms | 566 · 83 ms · 117 ms |
| `POST /api/app/events` (ad counters) | 50 | 894 · 52 ms · 74 ms | 697 · 70 ms · 97 ms |
| `POST /api/app/activate` (new device) | 20 | 356 · 52 ms · 76 ms | 285 · 68 ms · 113 ms |
| `POST /api/app/login` (bcrypt) | 10 | 6 · 1.7 s · 2.8 s | 6 · 1.7 s · 1.9 s |
| `GET /api/admin/clients` page 1 | 20 | 513 · 37 ms · 57 ms | 497 · 35 ms · 67 ms |
| `GET /api/admin/clients?q=…` search | 20 | 63 · 311 ms · 364 ms | 135 · 145 ms · 177 ms |
| `GET /api/admin/clients` last page | 20 | 399 · 49 ms · 61 ms | 364 · 52 ms · 68 ms |
| `GET /api/admin/licenses?status=active` | 20 | 101 · 188 ms · 242 ms | 448 · 42 ms · 77 ms |
| `GET /api/admin/stats` | 10 | 268 · 37 ms · 51 ms | 294 · 31 ms · 47 ms |

Errors: **0** in every row.

Review notes:

- The desktop-facing endpoints (config, events, activation) handle hundreds of requests per
  second on one process. Desktop apps check the configuration about **once a month**, so
  100,000 installations produce roughly 3,300 checks a day.
- Sign-in is deliberately slow (bcrypt cost 11 ≈ 0.25 s CPU per attempt) to resist password
  guessing. Sign-ins happen once per computer, so ~6/s on 4 vCPU is ample; add CPU or
  instances if needed. It is additionally rate-limited per IP.
- Found and fixed during the review: the license list counted rows with an unnecessary join
  to `clients`; the count now joins only when searching (`GET /api/admin/licenses` ~25–40 % faster).
- Admin search uses case-insensitive substring matching (`LIKE`) over name, e-mail, business
  and phone; ~145 ms on MySQL at 10,000 clients. For hundreds of thousands of clients add a
  MySQL FULLTEXT index on those columns.
- Use MySQL 8 in production (the SQLite mode is for development and small single-instance setups).
  Timestamps are stored as ISO-8601 UTC text on both databases (no year-2038 limit, no time-zone
  surprises).

## 4. Security checks covered by tests

- Rate limiting: 30 sign-in/activation attempts per 15 minutes per IP, then HTTP 429 (`ratelimit.test.js`).
- Input validation, duplicate e-mails, unauthenticated admin access and pagination limits are rejected with clear errors (API tests).
- License tokens: Ed25519 signature verified by the desktop, bound to the device; tampered
  payload, wrong key and other device are rejected (Rust tests); the server rejects tampered or foreign tokens on refresh (API tests).
- The trial survives a database reset (install marker file) and is not extended by moving the clock back (Rust tests + e2e).
- Remote configuration validation: HTTPS-only URLs, length and range limits (Rust tests); ad
  scripts never run (e2e).
- Financial documents are cancelled, never deleted; history is kept (e2e).
- Business data is never sent: the desktop only sends license/device identifiers and anonymous ad counters.

## 5. Known limitations

- **Direct PDF download** is implemented for Windows (WebView2 `PrintToPdf`) and Linux
  (WebKitGTK). Linux is covered by the e2e test; the Windows code is compiled and packaged by CI
  but was not clicked through on Windows in this run. On macOS the button falls back to the
  print dialog ("Save as PDF").
- Payment gateways: the provider interface, checkout, confirmation and webhook flow are tested
  with the built-in *mock* and *manual* providers. A real gateway (e.g. Razorpay) needs its keys
  and a small provider module (see `server/README.md`).
- Ad images must be HTTPS URLs; the e2e test used an HTML ad (no external image) because the test
  machine has no public HTTPS image host.
- The Tally Professional layout is modelled on the standard GST invoice particulars (CGST Rule 46)
  and the common Tally print layout; it is not an official Tally format.

## How to re-run everything

```bash
# desktop
cd document-generator
npm ci && npm test && npm run lint && npm run test:rust
npx tauri build --debug --no-bundle && xvfb-run -a node e2e/run.mjs

# server (SQLite; add TEST_DATABASE_URL / DATABASE_URL=mysql://… for MySQL)
cd ../server && npm ci && npm test && npm run loadtest

# portal
cd ../portal && npm ci && npm run build && node e2e/portal.e2e.mjs
```
