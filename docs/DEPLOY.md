# Deployment

The repository builds into one deployable unit: a Node.js server (`server/`) that serves the
pre-rendered website, the Service Desk app and the API from the same domain.

## What changes compared with the old static website

The old `main` branch deployed `index.html` from the repository root to Vercel as a static site.
After this restructure, the website lives in `webapp/` and is produced by `npm run build`
(`webapp/dist`). Vercel must not keep deploying the repository root, or it would publish source
files. Pick one of these options before merging into `main`.

### Option A — one Node host for everything (recommended)

Use a host that runs a long-lived Node.js process with a persistent disk (for example Railway,
Render with a disk, or a small VPS):

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Environment: everything in `server/.env.example`, plus `NODE_ENV=production`,
  `COOKIE_SECURE=true`, `TRUST_PROXY=1`, and `UPLOAD_DIR` pointing at the persistent disk.
- Point `a2zpowersolution.in` / `www` at this host in Zoho DNS (the host shows the records).

### Option B — website on Vercel, server elsewhere

In the Vercel project settings set **Root Directory** to `webapp`, **Build Command** to
`npm run build` and **Output Directory** to `dist`. Then add a rewrite so `/api/*` reaches the Node
server (keep the browser on one origin so the login cookie keeps working), in `webapp/vercel.json`:

```json
{
  "rewrites": [{ "source": "/api/:path*", "destination": "https://<your-server-host>/api/:path*" }]
}
```

Note that Vercel's free Hobby plan is for non-commercial use only.

## DNS at Zoho

Add only the A/CNAME records your host shows. If your email runs on Zoho Mail, do not delete the
existing MX / TXT records.

## Search engines

The website head (title, description, Open Graph, schema.org data) is in `webapp/index.html`;
`robots.txt` and `sitemap.xml` are in `webapp/public/`. They assume the domain
**www.a2zpowersolution.in**. After the first deploy:

1. Add the domain in Google Search Console (verify with a DNS TXT record in Zoho).
2. Submit `https://www.a2zpowersolution.in/sitemap.xml`.
3. Keep the Google Business Profile in sync with the phone number and address.

`robots.txt` keeps `/app/` and `/api/` out of search results.

## Editing website text

Edit `webapp/src/website/content.ts` (phone, email, services, clients) or
`webapp/src/website/Website.tsx` (layout), then rebuild and redeploy.
