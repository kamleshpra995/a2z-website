# Deployment

The repository builds into one deployable unit: a Node.js server (`server/`) that serves the
pre-rendered website (`/`), the Service Desk portal (`/portal/`) and the API (`/api`) from the same
domain. Data lives in MongoDB Atlas; ticket attachments live on a persistent disk.

Vercel alone cannot run this: the API is a long-running Node process that keeps attachments on
disk. The recommended host is **Render** (`render.yaml` in the repository root describes the
service). The old `main` branch still deploys the static website to Vercel until the domain is
switched over.

## 1. Before the first deploy

1. Run `npm run check` locally (types, tests, build, formatting).
2. Commit and push the `restructure` branch to GitHub. `render.yaml` deploys that branch; change
   `branch:` to `main` after merging.
3. MongoDB Atlas: create a database user just for production (or rotate the existing password)
   and keep the connection string ready.

## 2. Create the service on Render

1. Sign in at render.com with GitHub and allow access to the `a2z-website` repository.
2. **New → Blueprint**, pick the repository. Render reads `render.yaml` and creates the web
   service `a2z-power-solution` (Singapore, Starter plan, 1 GB disk at `/var/data`).
3. Enter the secret values it asks for:

   | Key                                           | Value                                                                                                          |
   | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
   | `MONGODB_URI`                                 | Atlas connection string                                                                                        |
   | `MONGODB_DB`                                  | same as in your local `server/.env` (e.g. `a2z-service-desk`)                                                  |
   | `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | only used if the database has no Admin yet                                                                     |
   | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`         | ZeptoMail SMTP details (`emailapikey` + the Agent's SMTP password); leave `SMTP_PASS` empty to keep emails off |

4. Atlas → **Network Access**: add the outbound IP addresses Render shows for the service
   (service page → **Connect → Outbound**). Then redeploy (**Manual Deploy → Deploy latest commit**).
5. Open the `…onrender.com` address Render gives you. Check `/`, `/portal/` and sign in as
   Super Admin. The service log should say `MongoDB API ready` and `ticket emails on`.

## 3. Point the domain (Zoho DNS)

Do this only after step 2 works on the `onrender.com` address.

1. Render → service → **Settings → Custom Domains**: add `www.a2zpowersolution.in` and
   `a2zpowersolution.in`. Render shows the records to use.
2. Zoho DNS: change only these two records to the values Render shows:
   - `www` **CNAME** (now Vercel) → the `…onrender.com` host
   - `a2zpowersolution.in` **A** (now `216.198.79.1`, Vercel) → Render's IP
3. Keep every other record: MX (`mx.zoho.in` …), the `zoho-verification` TXT, the ZeptoMail DKIM
   TXT (`…_domainkey`) and the `bounce-zem` CNAME, or email stops working.
4. Wait for Render to show the domains as verified with a certificate (minutes to a few hours).
5. In Vercel, remove the domain from the old project and pause or delete it, so a later merge
   into `main` does not publish a broken build there.

## 4. After going live

- **QR codes**: print store QR codes from the live portal. The build uses
  `VITE_PUBLIC_APP_URL`, so codes always point at `https://www.a2zpowersolution.in/portal/`.
- **Test data**: deactivate or delete the records whose names start with `TEST –` (see
  `test-accounts.local.md`, not committed) before giving logins to customers.
- **Backups**: enable Atlas backups (or regular exports) and keep Render's disk snapshots on;
  attachments are on the disk, everything else in Atlas.
- **Updates**: every push to the deployed branch redeploys automatically. A deploy with a disk has
  a short downtime while the service restarts.

## Search engines

The website head (title, description, Open Graph, schema.org data) is in `webapp/index.html`;
`robots.txt` and `sitemap.xml` are in `webapp/public/`. They assume the domain
**www.a2zpowersolution.in**. After the first deploy:

1. Add the domain in Google Search Console (verify with a DNS TXT record in Zoho).
2. Submit `https://www.a2zpowersolution.in/sitemap.xml`.
3. Keep the Google Business Profile in sync with the phone number and address.

`robots.txt` keeps `/portal/` and `/api/` out of search results.

## Editing website text

Edit `webapp/src/website/content.ts` (phone, email, services, clients) or
`webapp/src/website/Website.tsx` (layout), then push; Render rebuilds and redeploys.
