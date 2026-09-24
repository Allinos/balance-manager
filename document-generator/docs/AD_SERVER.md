# DocGen advertisement & remote configuration server

DocGen is an offline desktop app. The **only** thing it downloads is a small
JSON configuration file that controls an occasional advertisement popup. This
guide explains how to host that file (and the ad pages) on your own server.

> The ad server never receives business data. DocGen never sends invoices,
> customers, products, company details, document contents or the database.
> Optional event pings contain only `{ event, adVersion, appVersion, os }`.

---

## 1. How it fits together

```
DocGen (desktop)                                     Your server
────────────────                                     ───────────
app opens
  └─ reads local ad state (SQLite, table ad_state)
  └─ config older than fetchIntervalDays?  ── yes ─▶ GET /api/app-config  (JSON)
       (and computer is online)                      ◀─ validated, cached locally
  └─ decides: enabled? in date window? min days
     since last ad? monthly limit not reached?
  └─ shows popup (on overview pages only)  ────────▶ GET /ads/ad-01.html  (HTML in sandboxed frame)
  └─ optional anonymous event            ─────────▶ POST /api/events
```

If the server is down or the computer is offline, DocGen silently uses the
last cached configuration and keeps working normally.

---

## 2. The API

### `GET /api/app-config`

Returns JSON:

```json
{
  "version": 1,
  "fetchIntervalDays": 7,
  "ads": {
    "enabled": true,
    "monthlyLimit": 4,
    "minimumDaysBetweenAds": 7,
    "firstOpenDelayDays": 0,
    "randomize": false,
    "probability": 1,
    "title": "From the DocGen team",
    "ctaText": "Learn More",
    "contentUrl": "https://myserver.com/ads/ad-01.html",
    "clickUrl": "https://myserver.com/product",
    "startAt": "2026-01-01T00:00:00Z",
    "endAt": "2026-12-31T23:59:59Z",
    "version": "ad-01"
  }
}
```

| Field | Type | Meaning | Allowed range / default |
|-------|------|---------|-------------------------|
| `version` | number | Config version (stored as `lastConfigVersion`) | 0 – 1,000,000 |
| `fetchIntervalDays` | number | How often DocGen downloads this file | 1 – 90, default 7 |
| `ads.enabled` | bool | Master switch | default `false` |
| `ads.monthlyLimit` | number | Max ads per calendar month | 0 – 31, default 4 |
| `ads.minimumDaysBetweenAds` | number | Min days between two ads | 0 – 365, default 7 |
| `ads.firstOpenDelayDays` | number | No ads until N days after first launch | 0 – 365, default 0 |
| `ads.randomize` | bool | If true, show only with `probability` | default `false` |
| `ads.probability` | number | Chance (0–1) when randomize is on | default 1 |
| `ads.title` | text | Small heading above the ad | max 60 chars |
| `ads.ctaText` | text | Button text | max 30 chars, default "Learn More" |
| `ads.contentUrl` | HTTPS URL | The HTML page shown in the popup | **must be https://** |
| `ads.clickUrl` | HTTPS URL | Opened in the browser when the button is clicked | optional, https:// |
| `ads.startAt` / `ads.endAt` | RFC 3339 date | Campaign window | optional |
| `ads.version` | text/number | Ad identifier used in event counts | max 40 chars |

The older shape is also accepted:

```json
{ "adsEnabled": true, "monthlyLimit": 4, "minimumDaysBetweenAds": 7,
  "ad": { "enabled": true, "type": "HTML", "contentUrl": "https://example.com/ad.html",
          "clickUrl": "https://example.com/product", "version": 3 } }
```

### `POST /api/events` (optional)

Body: `{ "event": "AD_SHOWN" | "AD_CLICKED" | "AD_CLOSED", "adVersion": "ad-01", "appVersion": "1.0.0", "os": "windows" }`
Respond with `204`. Nothing else is ever sent.

---

## 3. Validation & security (what the app enforces)

DocGen validates every response in Rust before using it:

- The body must be a JSON object smaller than 64 KB.
- `contentUrl` and `clickUrl` must be `https://` URLs (no `http:`, `javascript:`, `file:` …).
  Plain `http://localhost` is accepted only in **debug** builds for testing.
- Numbers are clamped to the ranges above; dates must be valid RFC 3339 and `endAt ≥ startAt`.
- Only type `HTML` is supported; unknown types are rejected.
- Texts are truncated and stripped of control characters.
- Invalid responses are ignored and the previous cached config stays in use.

The ad page itself is displayed in an `<iframe sandbox="">`:

- **no JavaScript runs** inside the ad (use HTML + CSS only),
- it gets an opaque origin, so it cannot read the app, its storage or cookies,
- it has no access to Tauri APIs, the file system or the SQLite database,
- the app's Content-Security-Policy only allows HTTPS frames.

Changing the configuration can never download a new application or execute code
in DocGen. The app itself stays trusted local software.

---

## 4. Setting up the server

A ready-made Express server is included in [`ad-server/`](../ad-server):

```bash
cd ad-server
npm install
npm start            # listens on http://localhost:8787 (PORT env to change)
```

| Path | File |
|------|------|
| `GET /api/app-config` | `ad-server/app-config.json` (re-read on every request — no restart needed) |
| `POST /api/events` | in-memory counters, visible at `GET /api/stats` |
| `GET /ads/…` | static files in `ad-server/public/ads/` |

Put it behind HTTPS (required). Typical options:

- **VPS + Nginx/Caddy** reverse proxy with a Let's Encrypt certificate (Caddy does this automatically).
- **Render / Railway / Fly.io** — deploy the `ad-server` folder as a Node service; HTTPS is provided.

### Even simpler: static hosting only

You don't need Node at all. Any static host that serves HTTPS works — GitHub
Pages, Netlify, Cloudflare Pages, Firebase Hosting, S3 + CloudFront, or shared
hosting:

```
https://myserver.com/api/app-config      ← a file named app-config (or app-config.json) with the JSON above
https://myserver.com/ads/ad-01.html      ← your ad
```

(Leave `eventsUrl` empty in the app if you don't run the events endpoint.)

---

## 5. Pointing DocGen at your server

Edit `src-tauri/remote-config.json` **before building** the installer:

```json
{
  "configUrl": "https://myserver.com/api/app-config",
  "eventsUrl": "https://myserver.com/api/events",
  "requestTimeoutSecs": 8
}
```

Leave `configUrl` empty to build a version without any network access (no ads).
For local testing you can override both without rebuilding:

```bash
DOCGEN_CONFIG_URL=http://localhost:8787/api/app-config \
DOCGEN_EVENTS_URL=http://localhost:8787/api/events npm run app:dev
```

---

## 6. Day-to-day operations

**Change the ad** — upload a new HTML file (e.g. `ads/ad-02.html`), then change
`contentUrl` and `version` in `app-config.json`. No app update needed.

**Change frequency** — edit `monthlyLimit`, `minimumDaysBetweenAds`,
`firstOpenDelayDays`, `randomize`/`probability`.

**Enable / disable ads** — set `"enabled": false` to stop all ads (takes effect
the next time each installation refreshes its config, i.e. within
`fetchIntervalDays`). Use `endAt` to schedule an automatic stop.

**Change the ad URL** — edit `contentUrl` / `clickUrl`.

**Writing ad HTML** — a single self-contained page, ~480 × 300 px, HTML + inline
CSS, images via `https://` or `data:` URLs. Scripts, forms and plugins do not
run. See `ad-server/public/ads/ad-01.html`.

---

## 7. Caching, offline behaviour & request volume

- The config is downloaded **at most once every `fetchIntervalDays`** per
  installation (default 7). With 10,000 installs that is roughly 1,400
  requests per day.
- After a failed download (offline or server error) DocGen waits **one day**
  before trying again.
- The last valid config is cached in the local database (`ad_state.cachedConfig`)
  and used while offline or when the server is down.
- If no config was ever downloaded, no ads are shown.
- The server response sets `Cache-Control: public, max-age=3600`, so a CDN can
  absorb traffic spikes.
- Nothing is requested when `configUrl` is empty.

## 8. Monthly limits & impression tracking

Stored locally in the `ad_state` table:

| Key | Meaning |
|-----|---------|
| `lastAdShownAt` | time the last ad was shown (ms since epoch) |
| `monthlyAdCount` / `monthlyAdMonth` | ads shown in the current month (`YYYY-MM`); resets automatically each month |
| `lastConfigFetchAt` | last successful config download |
| `lastConfigAttemptAt` | last download attempt (used for the 1-day retry back-off) |
| `lastConfigVersion` | `version` of the cached config |
| `cachedConfig` | the last validated config |
| `firstOpenAt` | first launch time (for `firstOpenDelayDays`) |

Every `AD_SHOWN`, `AD_CLICKED` and `AD_CLOSED` is logged locally in `ad_events`
(last 500 kept) and, if `eventsUrl` is set, sent as an anonymous ping.

An ad is shown **at most once per app session**, a few seconds after start-up,
and only on the Dashboard, Documents or Created Documents pages — never while a
document is being created or edited.
