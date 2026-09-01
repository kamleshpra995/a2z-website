# A2Z Power Solution — Deployment Guide

This folder is a complete static website. No build step is needed.

Files: `index.html` (the site), `logo.png` (header logo), `favicon.png` (browser tab icon).

## Step 1 — Deploy on Vercel

Easiest way (no coding tools needed):

1. Go to https://vercel.com and log in (sign up free with Google/GitHub if needed).
2. On the dashboard, click "Add New… → Project".
3. Instead of importing from Git, simply drag and drop this whole folder onto the page (or use the "Deploy" upload option). Vercel also accepts the zip contents.
4. Click Deploy. In under a minute you get a live URL like `a2z-power-solution.vercel.app`.

Alternative (command line): install Node.js, then run `npx vercel` inside this folder and follow the prompts.

## Step 2 — Connect your Zoho domain

1. In the Vercel project, open Settings → Domains and add your domain, e.g. `a2zpowersolution.com` (and `www.a2zpowersolution.com`).
2. Vercel will show you the DNS records it needs. Typically:
   - `A` record, host `@`, value `76.76.21.21`
   - `CNAME` record, host `www`, value `cname.vercel-dns.com`
3. Log in to Zoho where the domain is managed (Zoho DNS / the registrar panel), open the DNS settings for your domain, and add those two records exactly as Vercel shows them.
4. Back in Vercel, wait for the domain check to turn green (can take a few minutes up to a couple of hours for DNS to propagate). HTTPS is issued automatically.

Note: If your email runs on Zoho Mail, do NOT delete the existing MX / TXT records — only add the A and CNAME records above. Your email will keep working.

## Step 3 — Get found on Google

The site already includes SEO metadata, structured data (schema.org), `robots.txt` and `sitemap.xml`. These all assume your domain is **www.a2zpowersolution.in** — if your actual domain is different, do a find-and-replace of `a2zpowersolution.in` in `index.html`, `robots.txt` and `sitemap.xml` before deploying.

To actually appear in Google search results:

1. Go to https://search.google.com/search-console and add your domain as a property.
2. Verify ownership — the easiest way is the DNS TXT record option: Google gives you a TXT record, you add it in Zoho's DNS panel (same place as Step 2).
3. Once verified, open "Sitemaps" in Search Console and submit: `https://www.a2zpowersolution.in/sitemap.xml`
4. Use "URL Inspection" on your homepage and click "Request Indexing".

Also strongly recommended: create a free Google Business Profile (https://business.google.com) with the same name, phone and address — for a service business this usually brings more calls than the website ranking itself. Bing has an equivalent at https://www.bing.com/webmasters.

Ranking for searches like "ice machine repair" or "cold room service" takes a few weeks after indexing and improves as the site gets linked and visited.

## Editing the site later

Open `index.html` in any text editor. Phone number, services, clients and address are all plain text in the file. After editing, re-upload the folder to Vercel (or run `npx vercel --prod`).
