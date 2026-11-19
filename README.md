# A2Z Power Solution

One repository for the public website and the Service Desk:

```
webapp/   React + TypeScript (Vite)
  index.html            public website page (content pre-rendered from src/website at build time)
  portal/index.html     Service Desk portal (single-page app), served under /portal/
  src/website/          website components and content (content.ts holds the text)
  src/app/              Service Desk UI: pages, components, hooks, API client
  public/               logo, favicon, robots.txt, sitemap.xml
server/   Node.js + Express + MongoDB, TypeScript
  src/index.ts          entry point
  src/http/             API routes and request validation
  src/domain/           business rules: auth, permissions, tickets, conversations, workflow
  src/storage/          MongoDB adapter and private attachment storage
  src/shared/           types and helpers shared with the webapp (imported there as @shared/…)
  src/migration/        one-off import of the old browser-only data
  scripts/              operator scripts (import, set password)
  test/                 Node test runner suites
docs/     deployment and architecture notes
```

Both folders are strict TypeScript. The server runs `.ts` files directly with Node.js 22.6+
(type stripping), so it has no build step; the webapp is built by Vite.

## URLs

| Path                  | What                                               |
| --------------------- | -------------------------------------------------- |
| `/`                   | Public website (static HTML, no JavaScript bundle) |
| `/portal/`            | Service Desk login and dashboard                   |
| `/portal/?store=<id>` | Public complaint form opened by a store QR code    |
| `/api/…`              | JSON API                                           |

Old QR codes that point at `/?store=<id>` are redirected to `/portal/?store=<id>`.

## Local development

1. Install Node.js 22.6 or newer (`nvm use` picks it up from `.nvmrc`), then run `npm install`.
2. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI`, `MONGODB_DB`,
   `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Never put credentials in a `VITE_` variable.
3. Run `npm run dev`. This starts the API on http://127.0.0.1:4173 and the webapp on
   http://localhost:5173 (website at `/`, Service Desk at `/portal/`). Vite forwards `/api` to the
   server, so the browser sees one origin.

## First sign-in (Super Admin)

There is no public sign-up. The Super Admin signs in first and adds everyone else under
**Users & logins** (staff and customer logins) or **Field workers**.

1. In `server/.env` set `ADMIN_NAME`, `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` (10+ characters).
2. Run `npm run admin:reset -w server`. It creates the Super Admin, or, if one already exists,
   changes its email and password to these values.
3. Open `/portal/` and sign in with that email and password.

## Ticket emails and WhatsApp updates

- **Emails** go out automatically when a ticket is raised, a technician is assigned, and when it is
  resolved, closed or reopened. Customers with a login for that store (and a QR raiser who gave an
  email) get the update; the assigned field worker gets the job details. Set the `SMTP_*` values in
  `server/.env` (Zoho Mail App Password) to turn them on; the server log says whether they are on.
- **WhatsApp** is a free button in the ticket detail ("Send update on WhatsApp") for Admin,
  Supervisor and the assigned field worker. It opens WhatsApp with the update typed in for the
  store manager, store contact, QR raiser or field worker; the sender presses Send. No WhatsApp API.

## Checks

```
npm run typecheck   # strict TypeScript, both folders
npm test            # server + webapp test suites
npm run build       # webapp/dist (website pre-rendered + app bundle)
npm run check       # all of the above plus Prettier
```

Set `TEST_MONGODB_URI` to a test Atlas cluster or replica set to also run the MongoDB integration
test; it creates a throwaway database and removes it afterwards.

## Production

`npm run build`, then on the server set `NODE_ENV=production` (plus `COOKIE_SECURE=true`, and
`TRUST_PROXY=1` behind a hosting proxy) and run `npm start`. One Node process serves the website,
the app and the API from `webapp/dist`. See [docs/DEPLOY.md](docs/DEPLOY.md).

## Importing the old browser data (optional)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#importing-legacy-browser-records).
