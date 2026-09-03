# RYTHM OS — SEO, GEO & AEO Current Implementation Roadmap

Current checkpoint: 2026-09-03  
Baseline audit: 2026-09-01  
Canonical production origin: `https://rythm-os.com`  
Legacy origin: `https://company.rythm-os.com`

This file is the current continuation checkpoint. In a future chat, open this file first, inspect `main` and Production, then continue with the first unblocked item in **Current next actions**. Do not close owner-, market-, recurring-monitoring-, or evidence-dependent work with synthetic evidence.

## Status legend

- `DONE` — implemented and verified at the stated acceptance boundary
- `PARTIAL` — useful implementation/evidence exists but recurring work or a named dependency remains
- `TODO` — not started or not yet evidenced
- `BLOCKED` — waiting on a prerequisite
- `OWNER` — requires founder/account-owner action or decision

## Baseline scores from 2026-09-01 audit

| Area | Score |
|---|---:|
| SEO | 42/100 |
| GEO | 51/100 |
| AEO | 34/100 |
| Technical SEO | 73/100 |
| Content Authority | 38/100 |
| Entity Authority | 24/100 |
| Google Discoverability | 32/100 |
| AI Discoverability | 29/100 |

Baseline classification: **INDEXABLE BUT LOW AUTHORITY**.

The scores above remain the original audit baseline. Do not silently rescore them from implementation progress; produce a new scored audit only when a comparable evidence-based reassessment is intentionally run.

## Current next actions

Continue in this order:

1. `M-07`: extend first-party conversion reporting from attributed demo/signup CTA/enterprise-inquiry initiation to confirmed signup and genuinely qualified enterprise lead outcomes.
2. `T-10`: commit/enforce the intended package-manager lockfile and reproducible clean-install policy if it is still unresolved on `main`.
3. `T-12`: reproduce/identify the single non-blocking homepage image-alt notice reported by Bing before making any markup change.
4. `M-05`: establish the fixed answer-engine mention/citation benchmark using the query/prompt set in this file and a reproducible logged methodology.
5. `T-09` / `M-01`–`M-03`: continue index coverage, query visibility and legacy-host retirement monitoring; the 90-day observation requirement cannot be closed early.
6. `T-03`: retain the Lighthouse lab baseline and add Search Console/CrUX field monitoring when enough real-user field data becomes available.
7. `P2-01` / `P2-02` / `E-08`: publish customer proof only after permission and measurable evidence exist.
8. `P2-08`–`P2-12` / `M-06`: produce original research, integration/partner proof, legitimate third-party authority, referring-domain evidence and transparent community discovery.

## Search foundation — current state

| ID | Status | Action / acceptance state | Owner |
|---|---|---|---|
| P0-01 | DONE | `robots.txt` published; canonical sitemap declared; public search/answer-engine crawlers allowed while private/API paths remain excluded | Engineering |
| P0-02 | DONE | Canonical `sitemap.xml` published on `rythm-os.com`; current discovery baseline contains 42 canonical URLs | Engineering |
| P0-03 | DONE | Legacy and `www` hosts permanently redirect to the apex canonical origin | Engineering |
| P0-04 | DONE | Legacy host removed from structured data, canonical metadata and runtime fallbacks | Engineering |
| P0-05 | DONE | Primary category unified as **Governed AI workforce platform** | Content/Engineering |
| P0-06 | DONE | Official `/about` page published and linked | Founder/Content |
| P0-07 | DONE | Stable Organization/Brand/WebSite/WebApplication/founder entity graph implemented | Engineering/Founder |
| P0-08 | DONE | Google Search Console property verified; canonical sitemap active; page-indexing and query baselines captured; `/templates` indexing requested | Founder/Growth |
| P0-09 | DONE | Bing Webmaster Tools verified; canonical sitemap submitted; legacy sitemap removed; URL Inspection baseline captured | Founder/Growth |
| P0-10 | DONE | Production metadata, redirects, robots, sitemap, public rendering and structured-data outputs verified | Engineering |
| P0-11 | DONE | Official RYTHM LinkedIn Company Page and GitHub Organization were verified and their organization-level URLs were added to `Organization.sameAs` in PR `#227` | Founder/Growth/Engineering |

## Verified organization profiles — completed 2026-09-03

Status: **DONE**

Verified organization-level profiles:

- LinkedIn Company Page: `https://www.linkedin.com/company/rythm-company-os`
- GitHub Organization: `https://github.com/Rythm-os`

Implementation evidence:

- PR `#227` — `Add verified organization profiles to structured data`
- Merge commit: `2389bc457b47f3afe8de1f6f648845dcfe3475fb`
- Both verified URLs are rendered in the Organization JSON-LD `sameAs` property.
- Founder `Person.sameAs` remains separate and unchanged.

## Google Search Console baseline — 2026-09-02

Property: `rythm-os.com`  
Canonical sitemap: `https://rythm-os.com/sitemap.xml` — **Success**

### Page indexing baseline

- Indexed: **29**
- Not indexed: **18**
- `11` — Duplicate, Google chose different canonical than user: legacy `company.rythm-os.com` URLs; expected migration residue, monitor only.
- `3` — Excluded by `noindex`: `/login`, `/signup`, and legacy `/signup`; intentional.
- `3` — Page with redirect: HTTP apex and legacy-host URLs; intentional.
- `1` — Discovered, currently not indexed: `/templates`; manual `Request indexing` successfully submitted on 2026-09-02.

### 3-month Search Performance baseline

| Metric | Baseline |
|---|---:|
| Total clicks | 3 |
| Total impressions | 39 |
| Average CTR | 7.7% |
| Average position | 39.3 |

Visible low-volume queries included `rythm support`, `rythm innovations`, `rythm technical services`, and `rthm ai`. Current evidence does **not** yet show meaningful non-branded category visibility for target terms such as `AI workforce platform` or `AI agents for business`.

## Bing Webmaster Tools baseline — 2026-09-02

- Property `rythm-os.com` is active.
- Initial observed search baseline: **0 clicks / 1 impression**.
- Canonical sitemap `https://rythm-os.com/sitemap.xml`: **Success**, **42 URLs discovered**.
- Legacy sitemap `https://company.rythm-os.com/sitemap.xml`: successfully removed after canonical sitemap validation.
- `/templates`: **Indexed successfully**; Bing reported **No SEO/GEO issues found**.
- Homepage historical Bing Index record was stale and still reflected the old redirect direction from an August crawl.
- Homepage `Live URL`: **URL can be indexed by Bing**; indexing request submitted successfully.
- Bing Live URL reported one non-blocking notice: `Alt attribute for images is missing` — `1 instance`. Existing shared RYTHM logo components already include descriptive alt text, and the exact reported instance was not exposed/reproducible in the available UI. Track as `T-12`; do not change markup by guesswork.

## IndexNow — completed 2026-09-02

Status: **DONE**

Implementation:

- PR `#224` — `Add production IndexNow submission`
- Production commit: `f757c1c36c7e47d0c75bb8a9a8b36748f2bf1c8b`
- Public verification key file is served from the canonical apex host and returns HTTP `200` with the exact key value.
- `scripts/submit-indexnow.mjs` fetches the live canonical sitemap, rejects non-canonical origins, deduplicates URLs, verifies the public key location, enforces the 10,000-URL batch limit, supports dry-run mode, and submits JSON to the IndexNow endpoint.
- `npm run seo:indexnow` exposes the submission command.
- `.github/workflows/indexnow.yml` supports manual and daily execution.
- PR `#225` added automatic submission on every `main` update, while retaining daily/manual fallback execution.
- Trigger commit: `57f24282dd6d31aad6e97b5de678f97bc81e3383`.

Production evidence:

- Vercel Production deployment for PR `#224` reached `READY` and aliases include `rythm-os.com`.
- Verification key file on `https://rythm-os.com` returned HTTP `200` after Production deployment.
- GitHub Actions IndexNow run `33669313931`: **SUCCESS**.
- Submission result: **`IndexNow accepted 42 canonical URLs with HTTP 202.`**

Operational policy: repeat submissions are safe; current automation submits the live canonical sitemap after `main` updates and once daily, so newly published canonical pages do not depend only on scheduled crawler discovery.

## Durable referral and conversion analytics — completed/extended 2026-09-03

Status: `M-04 DONE`; `M-07 PARTIAL`

Implementation evidence:

- PR `#228` — `Add durable referral and conversion analytics`
- Production merge commit: `b40299c968d4f38adef382a16c5330d24713fd44`
- Production deployment reached `READY`.
- First-party tables/views: `public_analytics_events`, `public_analytics_monthly`.
- RLS is enabled; anonymous and authenticated direct reads are disabled; service-role server access is used for ingestion/reporting.
- The public event stream is persisted through a server-only ingestion route.
- Attribution covers AI referrers and major organic-search referrers and preserves session attribution across the public journey.
- Attributed public conversion events include demo, signup CTA and enterprise-inquiry initiation events.
- The implementation intentionally does not persist identity, email, IP address, user-agent, raw referrer URL, tenant data or free-text content.

Remaining `M-07` acceptance gap: connect attribution to **confirmed signup** and a genuinely **qualified enterprise lead** outcome, not merely CTA/initiation events.

## Full Production SEO crawl — completed 2026-09-03

Status: **DONE**

Implementation:

- PR `#229` — `Add repeatable Production SEO crawl`
- Production merge commit: `b5876100d34e958f0a24542f1181594b93cf59f7`
- `scripts/crawl-production.mjs` reads the live canonical sitemap and validates Production HTTP status, redirects, self-referencing canonical tags, unintended `noindex`, internal public links and sitemap orphans.
- `.github/workflows/production-seo-crawl.yml` makes the crawl repeatable after `main` changes and on a weekly schedule.

First crawl found four real sitemap orphans:

- `/product-architecture`
- `/use-cases/startups`
- `/use-cases/agencies`
- `/use-cases/software-companies`

They were given discoverable internal links in the public footer. The post-deployment crawl then passed with:

| Metric | Result |
|---|---:|
| Sitemap URLs crawled | 42 |
| Distinct internal URLs discovered | 42 |
| Notices | 0 |
| Failures | 0 |

Final crawl evidence: **no broken sitemap pages, canonical defects, unintended `noindex` directives, or orphan sitemap pages detected**.

## Production performance baseline — 2026-09-03

Status: `T-03 PARTIAL` — lab baseline is complete; real-user field monitoring remains pending until sufficient Search Console/CrUX data exists.

Methodology:

- Canonical target: `https://rythm-os.com`
- Lighthouse CLI: `12.8.2`
- Chrome on runner: `151.0.7922.173`
- Environment: GitHub Actions `ubuntu-24.04`
- Samples: 3 mobile + 3 desktop runs
- Reported baseline: median of the three samples for each strategy
- Raw Lighthouse JSON plus normalized summary are retained as the `production-lighthouse-baseline` workflow artifact for 30 days.
- Workflow run `33723524056`: **SUCCESS**

### Median Lighthouse lab baseline

| Metric | Mobile | Desktop |
|---|---:|---:|
| Performance score | 100 | 100 |
| FCP | 1,091 ms | 321 ms |
| LCP | 1,713 ms | 444 ms |
| Speed Index | 1,491 ms | 570 ms |
| TBT | 61 ms | 0 ms |
| CLS | 0.000 | 0.000 |

Raw Performance scores were `73 / 100 / 100` on mobile and `100 / 100 / 100` on desktop. The median baseline is therefore strong, but the mobile run variance is material enough that future comparisons should continue to use multiple samples rather than a single Lighthouse run.

Implementation:

- PR `#230` — `Capture Production performance baseline`
- `scripts/summarize-lighthouse-baseline.mjs` normalizes the median measurements.
- `.github/workflows/performance-baseline.yml` provides a reproducible Production benchmark.

Do **not** interpret this lab result as CrUX/Core Web Vitals field evidence. Close `T-03` only after sufficient real-user field data can be observed and incorporated into recurring monitoring.

## Category, answer and conversion coverage

Primary category: **Governed AI workforce platform**  
Secondary descriptor: **AI company operating system**  
Capability language: **AI Agents for business**, **multi-agent business operations**, **Company Memory**, **human-governed execution**

| ID | Status | Public surface |
|---|---|---|
| P1-01 | DONE | `/ai-workforce` |
| P1-02 | DONE | `/ai-agents-for-business` |
| P1-03 | DONE | `/how-it-works` |
| P1-04 | DONE | `/product/ai-agents` |
| P1-05 | DONE | `/product/integrations` |
| P1-06 | DONE | `/faq` |
| P1-07 | DONE | `/docs` |
| P1-08 | DONE | `/product-architecture` |
| P1-09 | DONE | `/use-cases` |
| P1-10 | DONE | `/use-cases/startups` |
| P1-11 | DONE | `/use-cases/agencies` |
| P1-12 | DONE | `/use-cases/software-companies` |
| P1-13 | DONE | `/glossary` |
| P1-14 | DONE | `/security` strengthened |
| P1-15 | DONE | `/pricing` strengthened |
| P1-16 | DONE | `/enterprise` strengthened |

Comparison coverage already published for Lindy, Relevance AI, CrewAI and Microsoft Copilot Studio using visible sources/review dates.

## Proof, comparisons and authority backlog

| ID | Status | Action | Owner |
|---|---|---|---|
| P2-01 | TODO | Publish 2–3 permissioned customer stories with measurable outcomes and limitations | Founder/Growth |
| P2-02 | BLOCKED | Publish `/customers` hub after at least two substantive verified stories exist | Content |
| P2-03 | DONE | Fair comparison framework | Content/Growth |
| P2-04 | DONE | RYTHM vs Lindy | Content/Growth |
| P2-05 | DONE | RYTHM vs Relevance AI | Content/Growth |
| P2-06 | DONE | RYTHM vs CrewAI | Content/Engineering |
| P2-07 | DONE | RYTHM vs Microsoft Copilot Studio | Content/Growth |
| P2-08 | TODO | Create original, reproducible governance/multi-agent benchmark or research asset | Product/Growth |
| P2-09 | TODO | Earn legitimate third-party coverage and founder/technical mentions | Founder/Growth |
| P2-10 | TODO | Establish accurate review-platform presence; request honest reviews from real users only | Growth |
| P2-11 | TODO | Publish factual integration/partner proof and reciprocal listings where available | Growth/Engineering |
| P2-12 | TODO | Seed expert/community discovery through useful, transparent participation | Founder/Growth |

## Technical backlog

| ID | Status | Action | Owner |
|---|---|---|---|
| T-01 | DONE | Automated SEO/GEO/AEO contract tests | Engineering |
| T-02 | DONE | Full Production crawl implemented; four discovered orphans fixed; final 42/42 canonical crawl passed with zero failures/notices | Engineering |
| T-03 | PARTIAL | Three-run mobile/desktop Lighthouse lab baseline captured; add Search Console/CrUX real-user field monitoring when sufficient data exists | Engineering |
| T-04 | DONE | Public image dimensions/formats/lazy-loading/alt/transfer audit | Engineering/Content |
| T-05 | DONE | Breadcrumb schema only where visible breadcrumbs exist | Engineering |
| T-06 | DONE | Visible machine-readable FAQ answers without unsupported FAQ rich-result claims | Engineering/Content |
| T-07 | TODO | Add `Article` schema + author + publish/modified dates when editorial content launches | Engineering/Content |
| T-08 | DONE | Deliberate search vs training-crawler policy documented | Founder/Legal/Security |
| T-09 | PARTIAL | 90-day sitemap/index coverage and legacy-host retirement observation is underway; cannot be marked complete before the monitoring period is evidenced | Growth/Engineering |
| T-10 | TODO | Commit intended package-manager lockfile and enforce reproducible clean installs | Engineering |
| T-11 | DONE | Production IndexNow verification + automated canonical URL submission | Engineering |
| T-12 | TODO | Reproduce/identify Bing homepage missing-alt notice before making any markup change | Engineering |

## Entity and trust backlog

| ID | Status | Action | Owner |
|---|---|---|---|
| E-01 | DONE | Official LinkedIn Company Page verified: `linkedin.com/company/rythm-company-os` | Founder |
| E-02 | DONE | Organization-level GitHub entity verified: `github.com/Rythm-os` | Founder/Engineering |
| E-03 | DONE | Verified company LinkedIn/GitHub profiles added to `Organization.sameAs` in PR `#227` | Engineering |
| E-04 | PARTIAL | Founder/operator identity + LinkedIn link published; experience bio still requires founder-approved facts | Founder/Content |
| E-05 | DONE | Reviewed/updated dates on high-change trust, pricing, support, comparison and docs pages | Content/Engineering |
| E-06 | TODO | Add public status/uptime page when customer-facing operational monitoring is ready | Engineering |
| E-07 | DONE | Public Beta support and incident communication expectations published | Operations/Content |
| E-08 | TODO | Add testimonials/logos/proof only with permission and evidence | Founder/Growth |

## Measurement and reporting

| ID | Status | Metric / next requirement | Cadence | Source |
|---|---|---|---|---|
| M-01 | PARTIAL | Baseline captured; continue indexed canonical URLs, exclusions and crawl-error monitoring | Weekly for 8 weeks, then monthly | Google Search Console |
| M-02 | PARTIAL | Branded baseline captured; continue clicks/impressions and query-variant tracking | Monthly | Google Search Console |
| M-03 | PARTIAL | Google/Bing baseline captured; track non-branded category visibility by landing page | Monthly | GSC + Bing Webmaster Tools |
| M-04 | DONE | Privacy-safe AI/organic attribution now persists to first-party Production analytics with server-side reporting foundation | Monthly | First-party analytics/logs |
| M-05 | TODO | Fixed answer-engine mention/citation benchmark | Monthly | Reproducible manual test log |
| M-06 | TODO | New referring domains and unlinked brand mentions | Monthly | Reputable backlink/mention source |
| M-07 | PARTIAL | Attributed demo/signup CTA/enterprise-inquiry initiation events persist; connect confirmed signup and qualified-enterprise outcomes | Monthly | First-party analytics/CRM |

## Fixed query / answer-engine benchmark

Retest with consistent locale and signed-out/private sessions where possible. Never claim a precise rank without observable evidence.

Branded queries: `RYTHM Company OS`, `RYTHM OS`, `Rythm AI`, `Rythm company OS`, `site:rythm-os.com`.

Commercial queries: `AI workforce platform`, `governed AI workforce platform`, `AI agents for business`, `AI employees platform`, `AI company operating system`, `multi-agent business platform`, `build a company with AI agents`, `autonomous company software`, `enterprise AI agent platform`, `human-in-the-loop AI agent platform`.

Answer-engine prompts:

- What are the best platforms for building a company with AI agents?
- What software can create an AI workforce for a business?
- What are the best governed AI workforce platforms?
- What are alternatives for running a virtual company with AI employees?
- How is an AI company operating system different from ChatGPT or automation software?
- Which AI agent platforms keep consequential approvals with a human executive?

## Continuation protocol for the next chat

1. Open this file first.
2. Inspect current `main`, open PRs, latest Production deployment and relevant monitoring evidence before changing a status.
3. Start with the first genuinely unblocked item in **Current next actions**.
4. Preserve completed search foundations, canonical-host policy, IndexNow, analytics privacy boundaries, Production crawl automation and performance-baseline methodology.
5. Never fabricate customer proof, rankings, AI citations, backlinks, CrUX data or third-party authority.
6. After material progress, update this checkpoint again so the next chat can resume without reconstructing history.

## Definition of completion

The roadmap is complete only when all five conditions are evidenced:

1. Production technical validation and confirmed indexability.
2. Consistent product/entity language across first-party surfaces.
3. Substantive category, question and comparison coverage.
4. Verifiable third-party mentions and market proof.
5. Measurable growth in non-branded discovery, qualified organic conversions and AI citations over repeated baselines.
