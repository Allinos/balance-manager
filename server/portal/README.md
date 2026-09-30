# DocGen client portal & admin panel

React + Vite single-page app, part of the [DocGen server](../README.md) and served on the
server's port (default <http://localhost:8787>) — no separate web server or port.

**Client portal** (`/`, `/register`, `/login`, `/account/*`): plans, registration, business
details, checkout, activation codes and license validity, activated computers (release a
device), payments, account settings.

**Admin panel** (`/admin/*`): dashboard, clients (create manually, reset password), licenses
(create/bulk codes, activate without payment, extend, suspend, release devices), plans,
payments (mark bank/UPI payments paid), ads (HTML, image, targeting, schedule, stats),
app configuration (check interval, ad policy, help videos, latest version), audit log.

Run everything from the `server` folder (one `package.json`):

```bash
cd server
npm install
npm start              # builds portal/dist when the sources changed, then serves API + portal on :8787
npm run dev            # same port, portal served live from portal/src with instant reload
npm run build          # build portal/dist explicitly
npm run test:portal    # browser end-to-end test (needs Playwright + a built portal)
```

No business data from the desktop app ever reaches the portal or server.
