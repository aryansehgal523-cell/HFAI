# HireFlow AI

Real jobs from company career pages, ranked for you. A resume in Google's XYZ format written for every one, a resume score you can watch go up, one click autofill, and the people who can refer you.

**Apply first** (AI job matching) · **Apply right** (tailored resume, resume score, autofill) · **Get referred** (referral engine)

| Feature | Free | Premium (₹999 / month or ₹7,999 / year) |
| --- | --- | --- |
| Job search, ghost job filter, tracker | Yes | Yes |
| Tailored resumes and cover letters | 3 a month | 30 a month (+ ₹199 for 10 more) |
| Resume upload (PDF / Word) with autofill of your profile | Yes | Yes |
| Resume score with fixes | Yes | Yes, before and after every tailoring |
| Job matching | Score and reasons on every job | Plus AI verdicts and a daily top 10 |
| Referral engine | Import your network, see how many you know | Names, ranking, drafted requests, tracking |
| AI coach | Sample conversations | 60 messages a day |
| Chrome extension autofill | Contact details, 3 applications a month | Every field, resume attached, AI answers |

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
| Resume upload (PDF via Claude + unpdf, DOCX via mammoth), onboarding | `src/app/api/profile/upload`, `src/app/(site)/onboarding`, `src/lib/resume-file.ts` |
| Resume score (pure, 7 categories) and history | `src/lib/resumeScore.ts`, `src/lib/score-store.ts`, `src/components/ResumeScoreUI.tsx` |
| Referral engine (LinkedIn CSV, company matching, ranking, drafts, tracking) | `src/lib/referrals`, `src/app/(site)/referrals`, `src/app/api/referrals` |
| Job matching and daily AI verdicts | `src/lib/matching.ts`, `src/lib/match-store.ts` |
| AI coach (streaming, in hand pay tool) | `src/app/(site)/coach`, `src/app/api/coach`, `src/lib/coach.ts`, `src/lib/tax.ts` |
| Server side resume PDF | `src/lib/resume-pdf.ts`, `/api/resume/pdf` |
| Chrome extension (MV3) and its API | `extension/`, `src/app/api/ext`, `src/lib/ext-auth.ts` |
| Fair use limits stored in the database | `src/lib/usage.ts` (`usage_events`) |
| Tests (crawler, parsing, scoring, matching, referrals, tax, field mapping...) | `tests/` |

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

### Chrome extension
1. `npm run ext:build` builds `extension/dist` for `http://localhost:3000`. For production run `HIREFLOW_API=https://yourdomain npm run ext:build` (the API origin is baked into the build and its host permission).
2. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist`. Copy the extension id it shows.
3. Set `EXTENSION_ID` to that id in production so `/api/ext` only accepts requests from your extension (in development any unpacked extension is allowed).
4. In HireFlow → Account and billing → **Connect the Chrome extension**, then type the code into the extension.
5. Try it on the local test forms: `npm run ext:test-forms` and open http://localhost:5178 (Greenhouse, Lever and a two step Workday form).
6. Chrome Web Store: zip `extension/dist` (after a production build), add 128 px icons and screenshots, and submit. The store listing needs your privacy policy URL and a justification for the `scripting` and host permissions (filling the form the user chooses).

### Resume score, matching and coach
* Resume score and job matching are pure functions (no AI, no cost). Matches are recomputed after profile changes and for new jobs after each crawl.
* Premium AI verdicts run at most once a day per user, in the background. The coach uses `ANTHROPIC_STRONG_MODEL`; parsing and verdicts use `ANTHROPIC_FAST_MODEL`.
* The in hand pay estimate uses the tax slabs in `src/lib/tax.ts` (`TAX_CONFIG`, FY 2025-26). **Check them after every Union Budget.**
* Development only: `HF_DEV_NOW=2026-12-01` (or `/referrals?asOf=2026-12-01`) pretends it is another date, to test referral follow ups.

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

HireFlow reads jobs straight from employers' own hiring systems. It never scrapes job boards (Naukri, LinkedIn, Indeed, Foundit, Shine).

| Source | What we read | Token in `/admin` |
| --- | --- | --- |
| Greenhouse, Lever, Ashby | Public job board APIs | Board token (`stripe`) |
| Workable | Public jobs widget | Account (`remofirst`) |
| Recruitee | `{company}.recruitee.com/api/offers/` | Subdomain (`bunq`) |
| Workday | The JSON endpoints the career site itself calls (`/wday/cxs/...`), filtered to India when the site offers it | `tenant.wdN/Site` (`nvidia.wd5/NVIDIAExternalCareerSite`) |
| Oracle Recruiting Cloud | The REST endpoints the career site calls (`/hcmRestApi/.../recruitingCEJobRequisitions`) | `host/Site` (`fa-etvl-saasfaprod1.fa.ocs.oraclecloud.com/CX_1`) |
| SmartRecruiters | Public career pages (`careers.smartrecruiters.com/{Company}`); its API host's robots.txt only admits LinkedIn, so we don't use it | Company id (`Experian`) |
| Keka | `{company}.keka.com/careers/api/embedjobs/...` (robots.txt allows `/careers` only) | Subdomain (`jupiter`) |
| JSON-LD | schema.org JobPosting pages listed in the careers site's sitemap | Careers host (`careers.unilever.com`) |

**Job search APIs (Phase 2).** To cover every kind of role in every city, the crawl also asks Adzuna and Jooble for 150+ role keywords (tech, sales, finance, HR, operations, support and BPO, teaching, healthcare, logistics, retail, banking, legal, freshers and internships) across the 40 biggest Indian cities plus remote. Each source works through that plan a little each run, inside its daily limit, and continues where it stopped. Aggregator jobs attach to the employer's company when we already crawl it (matched by normalised name), otherwise to a new company marked `AGGREGATOR`. Each job keeps the source's own id and link, and shows "Jobs by Adzuna" or "Jobs by Jooble".

| Key | Where to get it | Terms to check first |
| --- | --- | --- |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | developer.adzuna.com (free key) | Free keys are for evaluation. Commercial products get a 14 day trial, then need a licence from Adzuna. |
| `JOOBLE_API_KEY` (+ `JOOBLE_HOST`) | jooble.org/api/about (request form) | Jooble's site terms forbid republishing listings without written permission, so get that in writing. |

Careerjet is not used: its API must be called with the IP address of the visitor doing the search, so it can't feed a stored job list. These two APIs are called with our key under their API terms, so the robots.txt check (meant for crawlers) is not applied to them; every employer site still gets it.

**Duplicates.** The same opening often comes from the employer and an aggregator. Jobs with the same company, normalised title and city, posted within 7 days and with overlapping descriptions are one job. We keep the employer's feed, otherwise the aggregator with the fullest description, and list the other links on the job page ("Also listed on").

**Expiry.** An aggregator job closes when 3 complete runs of the query that found it no longer return it, or 30 days after posting.

Not supported, and why: **Darwinbox** (no public, unauthenticated job feed), **SAP SuccessFactors** career sites (job data comes from `/services/`, which their robots.txt disallows), **TurboHire** (its robots.txt admits only Googlebot), **PeopleStrong** (the career portal needs a login session), and career sites that only render jobs in the browser.

**Rules every connector follows** (in `src/lib/ingest/http.ts`): the HireFlowBot user agent with `CRAWLER_CONTACT_EMAIL`, robots.txt checked for every URL, at most one request per second per host, retries with backoff, and a host is skipped for the rest of the run after repeated errors. Detail pages are only opened for jobs we haven't stored yet (at most `--details` per company per run), and jobs outside the crawl scope are remembered for 30 days so they aren't opened again.

**Crawl scope.** `CRAWL_SCOPE=all` (the default) stores every job worldwide, but each run opens Indian jobs first (Workday's India filter, SmartRecruiters' Indian locations, Indian city names in JSON-LD URLs), so the per run detail budget reaches them first. `CRAWL_SCOPE=india` stores only jobs in India plus jobs whose location doesn't name a country (usually "Remote"); jobs clearly elsewhere, or in regions such as EMEA or AMER, are skipped.

**Adding companies**

* One company: in `/admin`, use *Add by careers page* (detects the hiring system) or *Add by hiring system and token*.
* Many companies: put them in a JSON file (`[{ "name", "careersUrl" }]`) or CSV (`name,careersUrl`) and run

  ```bash
  npm run detect:ats -- my-companies.csv     # writes data/detected-companies.json and data/detect-unmatched.json
  npm run companies:import -- --crawl        # adds them to the crawl list and crawls them
  ```

  With no file, `detect:ats` reads `src/config/companySeeds.json` (about 1,650 companies). It resumes where it stopped; `--retry-unmatched` tries the unmatched ones again and `--finalize` only rebuilds the output files. Matches found by guessing a board token are checked again (the board's name must match, and an Indian company's feed must have Indian jobs) before they are written out.
* Review `data/detect-unmatched.json` for companies to add by hand.

**MNC and company type filter (Phase 3).** Every company has a type (MNC, GCC, Indian large, unicorn, startup, government, other) and an MNC flag, used by the "MNCs only" switch and the chips on `/jobs` (`?mnc=1`, `?ctype=UNICORN,GCC`), the MNC badge, and the "Kind of company" matching preference.

* An MNC has at least 5,000 employees and works in several countries, or is on the curated list in `src/config/mncList.json` (Fortune Global 500, Forbes Global 2000, major global tech). Large Indian groups in `src/config/companyLists.json` (Tata, Reliance, Infosys, HCLTech, Wipro, Mahindra and others, including their group companies) are both Indian large and MNC. Foreign MNCs whose India teams are captive centres (banks, insurers, retailers, manufacturers) are typed GCC; technology and consulting firms are typed MNC; both count as MNCs.
* `npm run companies:enrich` adds employee counts and headquarters from Wikidata (cached in `data/wikidata-companies.json`, entries refreshed after 30 days) and reclassifies every company. Run it monthly (the crawl workflow does). New companies are classified from the seed list and the curated lists as soon as they appear.
* In `/admin`, the Type dropdown on a company overrides every automatic rule; "Auto" hands it back.
* Company names are matched with `src/lib/referrals/company.ts` (legal suffixes dropped, aliases such as TCS and Tata Consultancy Services, AWS and Amazon, Meta and Facebook), the same matcher the referral engine uses.

Remove any company's jobs within 48 hours if they ask (see `/bot`).

### Search, functions and the crawl schedule (Phase 4)

* **Search.** `jobs.search` is a generated full text column (title and company weigh most, then skills, then the description) with a GIN index; `pg_trgm` indexes on titles and locations make search and autocomplete forgiving of typos. Results are ranked by relevance and freshness. Every filter column has an index. Migration 0011 enables `pg_trgm` (Supabase allows it).
* **Job functions.** Every job gets a function (Engineering, Data and AI, Product, Design, Sales, Marketing, Finance, HR, Operations, Customer support, Consulting, Healthcare, Education, Other) from keyword rules in `src/lib/job-function.ts`; titles the rules can't place go to the fast Claude model in batches of 100 (capped per crawl, skipped without `ANTHROPIC_API_KEY`). Filter with `?fn=data-and-ai`.
* **The big crawl runs in GitHub Actions** (`.github/workflows/crawl.yml`): every 6 hours, oldest crawled companies first, up to about 5 hours, then the job search APIs. It is resumable (the next run continues where this one stopped) and safe to run twice (a lease in `crawl_state` makes a second crawl exit). A summary table is written to the job log. On the 1st of each month it runs `companies:enrich`. Add these repository secrets: `DATABASE_URL` (required), `ANTHROPIC_API_KEY`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `JOOBLE_API_KEY`, `CRAWLER_CONTACT_EMAIL`. Run it by hand from the Actions tab (mode: all, feeds-only, aggregators-only or enrich). The Vercel cron only does small top ups and skips itself while the big crawl runs.
* **Migrations are not run by the crawl.** After merging schema changes, run `npm run db:migrate` against production once (as for every release).
* **Monitoring.** `/admin` shows live jobs by source (and the change since the last crawl), recent crawls with new, closed and duplicate counts, failing sources, whether a crawl is running, and an alert when a source drops more than 50% between crawls.
* **Sitemaps.** `/sitemap/0.xml`, `/sitemap/1.xml`... hold 45,000 jobs each (ten files are always served, so new jobs need no redeploy); `robots.txt` lists the ones in use.

## 6. Useful commands

| Command | What it does |
| --- | --- |
| `npm run local` | Start everything on your computer (built in database, demo data, site) |
| `npm run dev` | Development server only (needs DATABASE_URL) |
| `npm run build && npm start` | Production build and server |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database in the browser |
| `npm run crawl` | Crawl active companies, oldest crawl first (`-- --limit 200 --minutes 50 --details 300`) |
| `npm run detect:ats` | Detect hiring systems for a list of companies (see section 5) |
| `npm run companies:import` | Import detected companies into the crawl list |
| `npm run companies:enrich` | Classify companies (MNC, GCC, unicorn...) with Wikidata; monthly |
| `npm test` | Run unit tests |
| `npm run typecheck` | TypeScript check |
