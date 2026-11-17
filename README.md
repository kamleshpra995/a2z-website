# A2Z Power Solution

One repository for the public website and the Service Desk:

```
webapp/   React + TypeScript (Vite)
  index.html            public website page (content pre-rendered from src/website at build time)
  app/index.html        Service Desk single-page app, served under /app/
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

Both folders are strict TypeScript. The server runs `.ts` files directly with Node.js 22.18+
(built-in type stripping), so it has no build step; the webapp is built by Vite.

## URLs

| Path               | What                                               |
| ------------------ | -------------------------------------------------- |
| `/`                | Public website (static HTML, no JavaScript bundle) |
| `/app/`            | Service Desk login and dashboard                   |
| `/app/?store=<id>` | Public complaint form opened by a store QR code    |
| `/api/…`           | JSON API                                           |

Old QR codes that point at `/?store=<id>` are redirected to `/app/?store=<id>`.

## Local development

1. Install Node.js 22.18 or newer, then run `npm install` in this folder.
2. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI`, `MONGODB_DB`,
   `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Never put credentials in a `VITE_` variable.
3. Run `npm run dev`. This starts the API on http://127.0.0.1:4173 and the webapp on
   http://localhost:5173 (website at `/`, Service Desk at `/app/`). Vite forwards `/api` to the
   server, so the browser sees one origin.

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
