# DocGen client portal & admin panel

React + Vite single-page app, served by the [DocGen server](../server) from `portal/dist`.

**Client portal** (`/`, `/register`, `/login`, `/account/*`): plans, registration, business
details, checkout, activation codes and license validity, activated computers (release a
device), payments, account settings.

**Admin panel** (`/admin/*`): dashboard, clients (create manually, reset password), licenses
(create/bulk codes, activate without payment, extend, suspend, release devices), plans,
payments (mark bank/UPI payments paid), ads (HTML, image, targeting, schedule, stats),
app configuration (check interval, ad policy, help videos, latest version), audit log.

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api to the server on :8787
npm run build    # dist/ (served by the server in production)
node e2e/portal.e2e.mjs   # end-to-end test (needs Playwright + a built portal)
```

No business data from the desktop app ever reaches the portal or server.
