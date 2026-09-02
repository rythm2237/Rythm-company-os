# RYTHM OS — SEO, GEO & AEO Current Implementation Roadmap

Current checkpoint: 2026-09-02  
Baseline audit: 2026-09-01  
Canonical production origin: `https://rythm-os.com`  
Legacy origin: `https://company.rythm-os.com`

This file is the current continuation checkpoint. In a future chat, open this file first, inspect `main` and Production, then continue with the first unblocked item in **Current next actions**. Do not close owner-, market-, or evidence-dependent work with synthetic evidence.

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

## Current next actions

Continue in this order:

1. `P0-11` / `E-01`–`E-03`: create or verify official LinkedIn and organization-level GitHub profiles, then add only verified URLs to `Organization.sameAs`.
2. `M-04` / `M-07`: connect the implemented privacy-safe AI/organic referral events to durable analytics and conversion reporting.
3. `T-02`: complete a full Production crawl; fix broken links, orphans, unintended redirects or canonical defects found.
4. `T-03`: capture mobile/desktop lab performance now; establish Search Console/CrUX monitoring when field data is sufficient.
5. `T-09`: monitor index coverage and legacy-host retirement for at least 90 days.
6. `T-12`: identify the single non-blocking homepage image-alt notice reported by Bing if it remains reproducible.
7. `P2-01` / `P2-02` / `E-08`: publish customer proof only after permission and measurable evidence exist.
8. `P2-08`–`P2-12`: produce original research, integration/partner proof and legitimate third-party authority.

## Search foundation — current state

| ID | Status | Action / acceptance state | Owner |
|---|---|---|---|
| P0-01 | DONE | `robots.txt` published; canonical sitemap declared; public search/answer-engine crawlers allowed while private/API paths remain excluded | Engineering |
| P0-02 | DONE | Canonical `sitemap.xml` published on `rythm-os.com`; current Bing discovery confirms 42 canonical URLs | Engineering |
| P0-03 | DONE | Legacy and `www` hosts permanently redirect to the apex canonical origin | Engineering |
| P0-04 | DONE | Legacy host removed from structured data, canonical metadata and runtime fallbacks | Engineering |
| P0-05 | DONE | Primary category unified as **Governed AI workforce platform** | Content/Engineering |
| P0-06 | DONE | Official `/about` page published and linked | Founder/Content |
| P0-07 | DONE | Stable Organization/Brand/WebSite/WebApplication/founder entity graph implemented | Engineering/Founder |
| P0-08 | DONE | Google Search Console property verified; canonical sitemap active; page-indexing and query baselines captured; `/templates` indexing requested | Founder/Growth |
| P0-09 | DONE | Bing Webmaster Tools verified; canonical sitemap submitted; legacy sitemap removed; URL Inspection baseline captured | Founder/Growth |
| P0-10 | DONE | Production metadata, redirects, robots, sitemap, public rendering and structured-data outputs verified | Engineering |
| P0-11 | OWNER | Official external company/entity profiles still need verification before adding them to `Organization.sameAs` | Founder/Growth |

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
| T-02 | TODO | Full Production crawl and broken-link/orphan/redirect remediation | Engineering |
| T-03 | TODO | Lab performance baseline now; CrUX/Search Console monitoring when field data is sufficient | Engineering |
| T-04 | DONE | Public image dimensions/formats/lazy-loading/alt/transfer audit | Engineering/Content |
| T-05 | DONE | Breadcrumb schema only where visible breadcrumbs exist | Engineering |
| T-06 | DONE | Visible machine-readable FAQ answers without unsupported FAQ rich-result claims | Engineering/Content |
| T-07 | TODO | Add `Article` schema + author + publish/modified dates when editorial content launches | Engineering/Content |
| T-08 | DONE | Deliberate search vs training-crawler policy documented | Founder/Legal/Security |
| T-09 | TODO | Monitor sitemap/index coverage and legacy-host retirement for at least 90 days | Growth/Engineering |
| T-10 | TODO | Commit intended package-manager lockfile and enforce reproducible clean installs | Engineering |
| T-11 | DONE | Production IndexNow verification + automated canonical URL submission | Engineering |
| T-12 | TODO | Reproduce/identify Bing homepage missing-alt notice before making any markup change | Engineering |

## Entity and trust backlog

| ID | Status | Action | Owner |
|---|---|---|---|
| E-01 | OWNER | Create/verify official LinkedIn company page with exact name, canonical URL, logo, category and description | Founder |
| E-02 | OWNER | Decide/create/rename an organization-level GitHub entity appropriate for the company | Founder/Engineering |
| E-03 | TODO | Add only verified company profiles to `Organization.sameAs` | Engineering |
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
| M-04 | PARTIAL | AI/organic referral detection exists; connect durable analytics sink/server reporting | Monthly | First-party analytics/logs |
| M-05 | TODO | Fixed answer-engine mention/citation benchmark | Monthly | Reproducible manual test log |
| M-06 | TODO | New referring domains and unlinked brand mentions | Monthly | Reputable backlink/mention source |
| M-07 | TODO | Demo/signup/qualified-enterprise conversion by organic landing page | Monthly | First-party analytics/CRM |

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

## Definition of completion

The roadmap is complete only when all five conditions are evidenced:

1. Production technical validation and confirmed indexability.
2. Consistent product/entity language across first-party surfaces.
3. Substantive category, question and comparison coverage.
4. Verifiable third-party mentions and market proof.
5. Measurable growth in non-branded discovery, qualified organic conversions and AI citations over repeated baselines.
