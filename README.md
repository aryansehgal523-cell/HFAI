# HireFlow AI

Real jobs from company career pages, and a resume in Google's XYZ format written for every one.

Built with Next.js 15 (App Router), PostgreSQL + Drizzle ORM, NextAuth (Google + email), Razorpay Subscriptions, the Anthropic API, Tailwind CSS and Framer Motion.

## What's inside

| Area | Where |
| --- | --- |
| Landing page with animated XYZ rewrite demo | `src/app/(site)/page.tsx`, `src/components/HeroDemo.tsx` |
| Job search with filters, ghost job filter, pagination | `src/app/(site)/jobs`, `src/lib/jobs-query.ts` |
| Job detail with ATS match, Google for Jobs markup | `src/app/(site)/jobs/[id]` |
| Master resume import (AI) and editor | `src/app/(site)/profile`, `src/app/api/profile` |
| Tailored resume + cover letter, edit, PDF, Word | `src/app/(site)/tailor`, `src/app/print`, `src/lib/docx-export.ts` |
| Application tracker (kanban) | `src/app/(site)/dashboard` |
| Sign up / log in (Google + email, consent capture) | `src/app/(auth)`, `src/lib/auth.ts` |
| Credits (3 free, 30 Premium, monthly reset) | `src/lib/credits.ts`, `src/lib/plans.ts` |
| Razorpay subscriptions, top ups, webhook, GST invoice numbers | `src/app/api/billing`, `src/lib/razorpay.ts`, `src/lib/billing.ts` |
| Account & billing, data export, account deletion (DPDP) | `src/app/(site)/settings`, `src/app/api/account` |
| Admin: users, revenue, crawler, companies, support inbox | `src/app/(site)/admin` |
| Job crawler (Greenhouse, Lever, Ashby) + ghost scoring | `src/lib/ingest`, `scripts/crawl.ts`, `/api/cron/crawl` |
| Legal: privacy, terms, refund, grievance officer, employer page | `src/app/(site)/{privacy,terms,refund,contact,bot}` |
| SEO: sitemap, robots, metadata | `src/app/sitemap.ts`, `src/app/robots.ts` |
| Database schema and migrations | `src/db/schema.ts`, `drizzle/` |
| Tests (crawler mapping, parsing, ghost score, ATS, invoices) | `tests/` |

## Modern website checklist

| Item | How HireFlow covers it |
| --- | --- |
| Domain, hosting, SSL, CDN | Vercel hosting with automatic HTTPS and a global edge CDN (section 3). HSTS and security headers in `next.config.mjs` |
| Semantic HTML | `header`, `nav`, `main`, `section`, `article`, `aside`, `footer` throughout; skip to content link |
| Responsive, sticky nav, hierarchy, favicon | Mobile first Tailwind layout, sticky blurred header, Bricolage + Plex type scale, SVG favicon and PNG app icons |
| Home, About, Contact, legal | `/`, `/about`, `/contact` (form, email, registered office, grievance officer), `/privacy`, `/terms`, `/refund` |
| Cookie consent | `CookieConsent.tsx`: essential only or allow analytics; reopen from "Cookie settings" in the footer; withdrawal deletes GA cookies |
| CTAs, 404, loading states | Contrasting primary buttons, custom `not-found.tsx`, `error.tsx`, shimmer skeletons in `loading.tsx` for jobs, job detail, tracker, tailored resume |
| Form validation | `FormField.tsx`: instant messages on blur and while typing for sign up, log in and contact, plus server side Zod validation |
| Meta tags, sitemap, robots | Per page titles and descriptions, `sitemap.ts` (every open job), `robots.ts`, JobPosting structured data |
| Internal search with autocomplete | `/api/jobs/suggest` + `AutocompleteInput.tsx` (roles, companies, skills, cities; arrow keys and Enter) |
| Images, caching, minified code | `next/image` with AVIF/WebP, long cache headers on icons, ISR on the home page, Next.js minification and code splitting |
| Alt text, keyboard, contrast | Decorative images marked `aria-hidden`, visible focus rings, full keyboard use, WCAG AA text colours in both themes, reduced motion respected |
| Analytics | Google Analytics 4 via `NEXT_PUBLIC_GA_ID`, loaded only after consent; admin dashboard for business metrics |
| Social share metadata | Open Graph and Twitter tags, generated share image `opengraph-image.tsx` |
| Dark mode | `ThemeToggle.tsx`: device, light or dark, remembered, no flash on load |
| PWA | `manifest.ts`, maskable icons, `public/sw.js` (offline page, cached public pages, never caches personal data) |
| Automated backups | `.github/workflows/backup.yml` nightly `pg_dump` (30 days in GitHub, optional R2/S3 copy) + `scripts/restore.sh`; Neon also offers point in time restore |
| CI | `.github/workflows/ci.yml`: typecheck, tests, migrations and build on every push |

## 1. Run it on your computer (2 minutes, nothing else to install)

You only need **Node.js 20 or newer** ([nodejs.org](https://nodejs.org), pick the LTS version).

```bash
cd hireflow-ai
npm install
npm run local
```

Open **http://localhost:3000**. That's it: `npm run local` starts a built in PostgreSQL database (saved in `.data/`), creates the tables, adds 48 demo jobs the first time, and starts the site. Press **Ctrl+C** to stop; your accounts and data are kept for next time. Delete the `.data` folder to start fresh.

* Works the same on Windows (PowerShell), macOS and Linux.
* Port 3000 busy? Run `PORT=3001 npm run local` (PowerShell: `$env:PORT=3001; npm run local`).
* Put your email in `ADMIN_EMAILS` in a `.env` file (copy `.env.example`) before signing up to see `/admin`.
* Without API keys the site still works: sign up, search, filters, tracker, legal pages, dark mode. Resume import and tailoring need `ANTHROPIC_API_KEY`; payments need Razorpay test keys; the Google button appears once Google keys are set.

### Using your own PostgreSQL instead

Set `DATABASE_URL` in `.env` (local Postgres or a free [Neon](https://neon.tech) database) and `npm run local` uses it instead of the built in one. Other commands:

```bash
npm run db:migrate           # create or update tables
npm run db:seed              # crawl list + demo jobs (--no-demo to skip demo data)
npm run crawl                # pull real jobs from the companies in src/config/companies.ts
npm run dev                  # start the site only
npm test                     # unit tests
```

## 2. Configure each service

### Auth secret
`NEXTAUTH_SECRET`: run `openssl rand -base64 32` and paste the result.

### Google sign in
1. Google Cloud Console → APIs & Services → OAuth consent screen: External, app name "HireFlow AI", add your domain and the privacy policy URL.
2. Credentials → Create credentials → OAuth client ID → Web application.
3. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` and `https://yourdomain/api/auth/callback/google`.
4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The Google button appears automatically once both are set.

### Anthropic (resume parsing and tailoring)
Create a key at console.anthropic.com and set `ANTHROPIC_API_KEY`. Model names are configurable with `ANTHROPIC_FAST_MODEL` and `ANTHROPIC_STRONG_MODEL`; check the current model list and pricing before launch. The admin page shows tokens used in the last 30 days so you can track cost per credit.

### Razorpay (payments)
1. Sign up at razorpay.com and complete KYC with your company PAN, GSTIN and bank account. Razorpay checks that your site has the Terms, Privacy, Refund and Contact pages (already built).
2. Start in **Test Mode**. Settings → API Keys → generate. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `NEXT_PUBLIC_RAZORPAY_KEY_ID` (same as the key id).
3. Subscriptions → Plans → create:
   * "Premium monthly", ₹999, period monthly, interval 1 → paste its id into `RAZORPAY_PLAN_MONTHLY`
   * "Premium yearly", ₹7,999, period yearly, interval 1 → `RAZORPAY_PLAN_YEARLY`

   Prices live in `src/lib/plans.ts` (in paise, GST inclusive) and every price on the site is derived from it. Razorpay plans cannot be edited, so **when the price changes, create two new plans and replace both env values**. Existing subscribers stay on their old plan id and keep renewing at their old price: the webhook grants Premium for any captured subscription payment and never compares the amount with `plans.ts`.
4. Settings → Webhooks → add `https://yourdomain/api/billing/webhook`, choose a secret (put it in `RAZORPAY_WEBHOOK_SECRET`) and tick: `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.cancelled`, `subscription.halted`, `subscription.completed`, `order.paid`.
5. Test the full flow with Razorpay's test cards and test UPI ids, then switch to live keys.

How billing works: Checkout unlocks Premium instantly (signature verified in `/api/billing/verify`), every renewal arrives as `subscription.charged` which records the payment, creates a GST invoice number (`HF/2026-27/000001` style) and resets credits to 30. Cancelling keeps Premium until the period ends. Webhooks are idempotent.

### Analytics (optional)
Create a Google Analytics 4 property, copy the measurement id (`G-XXXXXXX`) into `NEXT_PUBLIC_GA_ID`. It only loads for visitors who choose "Allow analytics".

### Backups
In your GitHub repo → Settings → Secrets → Actions, add `DATABASE_URL`. The backup workflow runs every night at 02:00 IST and can also be started by hand from the Actions tab. For an off site copy add `BACKUP_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` and, for Cloudflare R2, `BACKUP_S3_ENDPOINT`. Practise a restore once: `./scripts/restore.sh hireflow-YYYY-MM-DD.dump "<new empty database url>"`.

## 3. Deploy (Vercel + Neon, about 20 minutes)

1. Push this folder to a private GitHub repo.
2. Create a Neon project in the Singapore or Mumbai region (closest to Indian users) and copy the connection string with `?sslmode=require`.
3. Run migrations against it once from your machine: `DATABASE_URL="<neon url>" npm run db:migrate && DATABASE_URL="<neon url>" npm run db:seed -- --no-demo`.
4. Import the repo on vercel.com, add every variable from `.env.example` with production values (`NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` = your domain).
5. Add your domain in Vercel → Domains.
6. `vercel.json` schedules `/api/cron/crawl` every 6 hours; set `CRON_SECRET` and Vercel sends it automatically. On the Hobby plan crons run once a day; use Pro, or call the endpoint from any scheduler with `Authorization: Bearer <CRON_SECRET>`.
7. Update the Google OAuth redirect URI and Razorpay webhook URL to the production domain.

## 4. Before you launch

* Fill in `src/config/company.ts`: legal name, CIN, GSTIN, registered address, grievance officer.
* Have a lawyer review the privacy policy, terms and refund policy. They are written for Indian law (DPDP Act 2023, IT Act) but are a starting point, not legal advice.
* Remove demo companies in `/admin` (untick Active) or seed with `--no-demo`.
* Grow the crawl list (below) to at least a few hundred companies.
* Replace the in memory rate limiter in `src/lib/api.ts` with Upstash Redis for production.
* Add Sentry for errors and set up email (Resend or Amazon SES) for job alerts and receipts.

## 5. Growing job coverage

Add companies from `/admin` (name, ATS, board token) and they are crawled immediately, or add them to `src/config/companies.ts` and re-run the seed. To find a company's token, open its careers page and look for links to `boards.greenhouse.io/<token>`, `jobs.lever.co/<token>` or `jobs.ashbyhq.com/<token>`. Indian ATS sites (Darwinbox, Keka, Zoho Recruit) need new connectors in `src/lib/ingest/connectors.ts` following the same `RawJob` shape; add a test with a sample payload in `tests/ingest.test.ts`.

Crawl politely: one request per company per run, an honest user agent, and remove any company's jobs within 48 hours if they ask (see `/bot`).

## 6. Useful commands

| Command | What it does |
| --- | --- |
| `npm run local` | Start everything on your computer (built in database, demo data, site) |
| `npm run dev` | Development server only (needs DATABASE_URL) |
| `npm run build && npm start` | Production build and server |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database in the browser |
| `npm run crawl` | Crawl all active companies now |
| `npm test` | Run unit tests |
| `npm run typecheck` | TypeScript check |
