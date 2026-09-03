# RYTHM OS — SEO, GEO & AEO Current Implementation Roadmap

Current checkpoint: 2026-09-03  
Baseline audit: 2026-09-01  
Canonical production origin: `https://rythm-os.com`  
Legacy origin: `https://company.rythm-os.com`

This is the continuation checkpoint for the next chat. Open this file first, inspect current `main`, Production, open PRs and fresh monitoring evidence, then continue with the first genuinely unblocked item under **Current next actions**. Do not close owner-, market-, recurring-monitoring-, answer-engine-, or evidence-dependent work with synthetic evidence.

## Status legend

- `DONE` — implemented and verified at the stated acceptance boundary
- `PARTIAL` — useful implementation/evidence exists but recurring work or a named dependency remains
- `TODO` — not started or not yet evidenced
- `BLOCKED` — waiting on a prerequisite
- `OWNER` — requires founder/account-owner action or decision

## Original audit baseline — 2026-09-01

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

These remain the original baseline scores. Do not silently rescore them from implementation progress; run a comparable evidence-based reassessment before publishing new scores.

## Current next actions

Continue in this order:

1. `T-12` — re-run Bing Live URL inspection and identify the historical homepage `Alt attribute for images is missing` instance. Current Production-rendered HTML does not reproduce it; do not change markup without Bing evidence.
2. `M-05` — establish the fixed answer-engine mention/citation benchmark using the fixed prompt set below and a reproducible logged methodology. Do not infer answer-engine visibility from web search results.
3. `T-09 / M-01–M-03` — continue Google/Bing index coverage, query visibility and legacy-host retirement monitoring. The 90-day observation requirement cannot be closed early.
4. `T-03` — retain the Lighthouse lab baseline and add Search Console / CrUX field monitoring when sufficient real-user data becomes available.
5. `P2-01 / P2-02 / E-08` — publish customer proof only after permission and measurable evidence exist.
6. `P2-08–P2-12 / M-06` — produce original research, integration/partner proof, legitimate third-party authority, referring-domain evidence and transparent community discovery.

## Search foundation

| ID | Status | Acceptance state |
|---|---|---|
| P0-01 | DONE | `robots.txt` published; canonical sitemap declared; public crawlers allowed while private/API paths remain excluded |
| P0-02 | DONE | Canonical `sitemap.xml` published on `rythm-os.com`; 42 canonical URLs in current crawl/discovery baseline |
| P0-03 | DONE | Legacy and `www` hosts permanently redirect to apex canonical origin |
| P0-04 | DONE | Legacy host removed from structured data, canonical metadata and runtime fallbacks |
| P0-05 | DONE | Primary category unified as **Governed AI workforce platform** |
| P0-06 | DONE | Official `/about` page published and linked |
| P0-07 | DONE | Stable Organization/Brand/WebSite/WebApplication/founder entity graph implemented |
| P0-08 | DONE | Google Search Console verified; canonical sitemap active; initial indexing/query baselines captured |
| P0-09 | DONE | Bing Webmaster Tools verified; canonical sitemap submitted; legacy sitemap removed |
| P0-10 | DONE | Production metadata, redirects, robots, sitemap, rendering and structured data verified |
| P0-11 | DONE | Verified organization LinkedIn/GitHub URLs added to `Organization.sameAs` |

## Verified organization profiles — DONE 2026-09-03

- LinkedIn Company Page: `https://www.linkedin.com/company/rythm-company-os`
- GitHub Organization: `https://github.com/Rythm-os`
- PR `#227` — Add verified organization profiles to structured data
- Merge commit: `2389bc457b47f3afe8de1f6f648845dcfe3475fb`

## Google Search Console baseline — 2026-09-02

Property: `rythm-os.com`  
Canonical sitemap: `https://rythm-os.com/sitemap.xml` — **Success**

Page indexing baseline:

- Indexed: **29**
- Not indexed: **18**
- `11` legacy duplicate/canonical migration residue
- `3` intentional `noindex`
- `3` intentional redirects
- `1` `/templates` discovered/not indexed at the time; indexing request submitted

3-month search-performance baseline:

| Metric | Baseline |
|---|---:|
| Clicks | 3 |
| Impressions | 39 |
| CTR | 7.7% |
| Average position | 39.3 |

No meaningful non-branded target-category visibility was evidenced at that baseline.

## Bing Webmaster Tools baseline — 2026-09-02

- Property active.
- Initial search baseline: **0 clicks / 1 impression**.
- Canonical sitemap: **Success**, **42 URLs discovered**.
- Legacy sitemap removed.
- `/templates`: indexed successfully.
- Homepage Live URL: indexable; indexing request submitted.
- Historical unresolved non-blocking notice: `Alt attribute for images is missing — 1 instance`.

### T-12 reproduction update — 2026-09-03

Status: `PARTIAL`.

The canonical homepage was re-fetched from current Production after the `M-07` deployment. Current server-rendered HTML contains three rendered `<img>` elements: sidebar logo, mobile-header logo and footer logo. All three render `alt="RYTHM Company OS"`. `og:image:alt` is also present.

Therefore the Bing notice is **not reproducible from current Production HTML**. No markup change was made by inference. Keep `T-12` open until a fresh Bing Live URL inspection either identifies the exact instance or confirms that the notice has cleared.

## IndexNow — DONE

- PR `#224` — production IndexNow submission.
- Production commit: `f757c1c36c7e47d0c75bb8a9a8b36748f2bf1c8b`.
- PR `#225` — automatic submission on `main` updates plus daily/manual fallback.
- GitHub Actions run `33669313931`: **SUCCESS**.
- Evidence: **42 canonical URLs accepted with HTTP 202**.

## Durable referral and conversion analytics

Status: `M-04 DONE`; `M-07 DONE`.

### M-04 foundation

- PR `#228` — Add durable referral and conversion analytics.
- Production merge commit: `b40299c968d4f38adef382a16c5330d24713fd44`.
- First-party objects: `public_analytics_events`, `public_analytics_monthly`.
- RLS enabled; anonymous/authenticated direct reads disabled; service-role server access used for ingestion/reporting.
- AI and major organic-search referral attribution persists across the public session.
- Initial attributed events covered demo, signup CTA and enterprise-inquiry initiation.
- Public analytics intentionally avoids identity, email, IP, user-agent, raw referrer URL, tenant data and free-text content.

### M-07 completion — 2026-09-03

- PR `#231` — `Complete M-07 confirmed conversion attribution`.
- Production merge commit: `6f1b9dad90f5481a0271645651f0a3b7cdce672e`.
- Production deployment reached `READY`.
- Canonical `https://rythm-os.com/enterprise` returned HTTP `200` with the new explicit Enterprise Beta intake form.
- Confirmed signup attribution is emitted server-side only after a real authenticated signup outcome, including email confirmation where required.
- OAuth signup is distinguished from OAuth login; established OAuth users are not counted as new signups.
- Enterprise identity/contact data is stored separately from identity-free analytics.
- A `qualified_enterprise_lead` outcome is emitted only when server-side criteria are met: non-consumer work email, 50+ employees, deployment horizon within six months, and decision-maker or executive-sponsor responsibility.
- Production migration `confirmed_conversion_outcomes` was applied successfully.
- No synthetic signup or Enterprise lead was created to close `M-07`, and no real conversion volume is claimed until genuine users generate outcomes.

## Reproducible npm installs — T-10 DONE 2026-09-03

Baseline evidence:

- `main` had no npm, pnpm or Yarn lockfile.
- CI used Node 22 with `npm install`.
- `package.json` used floating semver ranges; for example `next` was declared as `^15.4.6` and Vercel resolved later patch releases independently.

Implementation and verification:

- Canonical npm `package-lock.json` generated through GitHub Actions using Node 22 and live npm registry resolution; it was not hand-generated or synthesized.
- `package-lock.json` uses `lockfileVersion: 3`.
- `.npmrc` declares `package-lock=true`.
- CI changed from `npm install` to `npm ci` and enables npm cache from the committed lockfile.
- PR `#232` — `Enforce reproducible npm installs`.
- PR CI run `33726076763`: **SUCCESS**.
- `npm ci`, typecheck, lint, all existing phase/routing/software-company tests and build passed from a clean checkout.
- Merge commit: `9d265a4984d30f7b8baa3585dd4ae58727a40d9c`.
- Production Vercel deployment `dpl_GJdfd26seUsNiYGfcdssDgiDmT3s`: **READY** and aliased to `rythm-os.com`.

Acceptance boundary: `T-10 DONE`.

## Full Production SEO crawl — DONE 2026-09-03

- PR `#229` — Add repeatable Production SEO crawl.
- Production merge commit: `b5876100d34e958f0a24542f1181594b93cf59f7`.
- Automated crawl validates HTTP status, redirects, self-canonical, unintended `noindex`, internal links and sitemap orphans.
- Runs after relevant `main` changes and weekly.

First crawl found and fixed four real orphan pages:

- `/product-architecture`
- `/use-cases/startups`
- `/use-cases/agencies`
- `/use-cases/software-companies`

Final result:

| Metric | Result |
|---|---:|
| Sitemap URLs crawled | 42 |
| Distinct internal URLs discovered | 42 |
| Notices | 0 |
| Failures | 0 |

## Production performance baseline — 2026-09-03

Status: `T-03 PARTIAL`.

Lab-baseline portion is complete. Search Console / CrUX real-user field monitoring remains pending until sufficient field data exists.

Method:

- Target: `https://rythm-os.com`
- Lighthouse CLI: `12.8.2`
- Chrome: `151.0.7922.173`
- Runner: GitHub Actions `ubuntu-24.04`
- Samples: 3 mobile + 3 desktop
- Baseline: median of three samples
- Raw JSON + normalized summary retained as workflow artifact for 30 days
- Initial workflow run `33723524056`: **SUCCESS**

| Metric | Mobile | Desktop |
|---|---:|---:|
| Performance score | 100 | 100 |
| FCP | 1,091 ms | 321 ms |
| LCP | 1,713 ms | 444 ms |
| Speed Index | 1,491 ms | 570 ms |
| TBT | 61 ms | 0 ms |
| CLS | 0.000 | 0.000 |

Raw performance scores: mobile `73 / 100 / 100`; desktop `100 / 100 / 100`.

Implementation:

- PR `#230` — Capture Production performance baseline.
- Merge commit: `573f94021bfcae0e8daf24cd56b2f01628f1e954`.

Do not interpret Lighthouse lab data as CrUX / field Core Web Vitals evidence.

## Public category/content coverage

Primary category: **Governed AI workforce platform**  
Secondary descriptor: **AI company operating system**

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

Comparison coverage exists for Lindy, Relevance AI, CrewAI and Microsoft Copilot Studio.

## Proof / authority backlog

| ID | Status | Action |
|---|---|---|
| P2-01 | TODO | Publish 2–3 permissioned customer stories with measurable outcomes and limitations |
| P2-02 | BLOCKED | Publish `/customers` hub after at least two verified substantive stories |
| P2-03 | DONE | Fair comparison framework |
| P2-04 | DONE | RYTHM vs Lindy |
| P2-05 | DONE | RYTHM vs Relevance AI |
| P2-06 | DONE | RYTHM vs CrewAI |
| P2-07 | DONE | RYTHM vs Microsoft Copilot Studio |
| P2-08 | TODO | Original reproducible governance/multi-agent benchmark or research asset |
| P2-09 | TODO | Legitimate third-party coverage and founder/technical mentions |
| P2-10 | TODO | Accurate review-platform presence; honest real-user reviews only |
| P2-11 | TODO | Factual integration/partner proof and reciprocal listings where available |
| P2-12 | TODO | Useful, transparent expert/community participation |

## Technical backlog

| ID | Status | Action |
|---|---|---|
| T-01 | DONE | Automated SEO/GEO/AEO contract tests |
| T-02 | DONE | Full Production crawl; four orphans fixed; final 42/42 crawl clean |
| T-03 | PARTIAL | Lab baseline complete; field monitoring pending |
| T-04 | DONE | Public image dimensions/formats/lazy-loading/alt/transfer audit |
| T-05 | DONE | Breadcrumb schema only where visible breadcrumbs exist |
| T-06 | DONE | Visible machine-readable FAQ answers without unsupported rich-result claims |
| T-07 | TODO | `Article` schema + author + publish/modified dates when editorial content launches |
| T-08 | DONE | Search-vs-training crawler policy documented |
| T-09 | PARTIAL | 90-day sitemap/index/legacy-host monitoring underway |
| T-10 | DONE | Canonical npm lockfile + reproducible `npm ci` clean-install enforcement |
| T-11 | DONE | Production IndexNow verification + automated canonical submission |
| T-12 | PARTIAL | Current Production HTML does not reproduce Bing notice; fresh Bing Live URL evidence still required |

## Entity and trust backlog

| ID | Status | Action |
|---|---|---|
| E-01 | DONE | Official LinkedIn Company Page verified |
| E-02 | DONE | Organization-level GitHub entity verified |
| E-03 | DONE | Verified organization profiles added to `Organization.sameAs` |
| E-04 | PARTIAL | Founder/operator identity + LinkedIn published; experience bio still founder-fact dependent |
| E-05 | DONE | Reviewed/updated dates on high-change pages |
| E-06 | TODO | Public status/uptime page when operational monitoring is customer-ready |
| E-07 | DONE | Public Beta support and incident communication expectations |
| E-08 | TODO | Testimonials/logos/proof only with permission and evidence |

## Measurement and reporting

| ID | Status | Next requirement |
|---|---|---|
| M-01 | PARTIAL | Continue indexed canonical URLs/exclusion/crawl-error monitoring |
| M-02 | PARTIAL | Continue branded clicks/impressions/query-variant tracking |
| M-03 | PARTIAL | Track non-branded category visibility by landing page |
| M-04 | DONE | Durable privacy-safe AI/organic referral analytics in Production |
| M-05 | TODO | Fixed answer-engine mention/citation benchmark |
| M-06 | TODO | New referring domains and unlinked brand mentions |
| M-07 | DONE | Confirmed signup + server-qualified Enterprise lead attribution deployed; observe genuine outcome volume |

## Fixed query / answer-engine benchmark

Branded:

- `RYTHM Company OS`
- `RYTHM OS`
- `Rythm AI`
- `Rythm company OS`
- `site:rythm-os.com`

Commercial:

- `AI workforce platform`
- `governed AI workforce platform`
- `AI agents for business`
- `AI employees platform`
- `AI company operating system`
- `multi-agent business platform`
- `build a company with AI agents`
- `autonomous company software`
- `enterprise AI agent platform`
- `human-in-the-loop AI agent platform`

Answer-engine prompts:

- What are the best platforms for building a company with AI agents?
- What software can create an AI workforce for a business?
- What are the best governed AI workforce platforms?
- What are alternatives for running a virtual company with AI employees?
- How is an AI company operating system different from ChatGPT or automation software?
- Which AI agent platforms keep consequential approvals with a human executive?

Retest with consistent locale and signed-out/private sessions where possible. Log engine/product surface, date/time, locale, session state, exact prompt, RYTHM mention yes/no, observable citation yes/no, cited URL/domain and evidence reference. Never claim a precise ranking without observable evidence.

## Continuation protocol for the next chat

1. Open this file first.
2. Inspect current `main`, open PRs, latest Production deployment and monitoring evidence before changing a status.
3. Start with the first genuinely unblocked item in **Current next actions**.
4. Preserve completed canonical-host policy, IndexNow, privacy-safe analytics, Production crawl automation, Lighthouse methodology and npm reproducibility controls.
5. Never fabricate customer proof, rankings, AI citations, backlinks, CrUX data or third-party authority.
6. Update this checkpoint again after material progress.

## Definition of completion

The roadmap is complete only when all five conditions are evidenced:

1. Production technical validation and confirmed indexability.
2. Consistent product/entity language across first-party surfaces.
3. Substantive category, question and comparison coverage.
4. Verifiable third-party mentions and market proof.
5. Measurable growth in non-branded discovery, qualified organic conversions and AI citations over repeated baselines.
