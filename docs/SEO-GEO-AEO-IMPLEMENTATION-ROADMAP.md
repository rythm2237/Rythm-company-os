# RYTHM OS — SEO, GEO & AEO Implementation Roadmap

Baseline audit date: 2026-09-01  
Production release: PR `#219`, commit `0693065b3d859ac4aa0fca3be9b36f3770d1affc`
Canonical production origin: `https://rythm-os.com`  
Legacy origin: `https://company.rythm-os.com`

## How to continue this work

In a future chat, ask the agent to open this file, inspect the current Git status and production site, then continue with the first unblocked item marked `TODO`. Do not assume that a code change is live until its production URL and HTTP behavior have been verified after deployment.

Status legend:

- `DONE` — implemented and verified at the acceptance boundary stated by the item
- `READY` — specified and ready to implement
- `TODO` — not started
- `PARTIAL` — useful implementation exists, but a named dependency remains
- `OWNER` — requires an account owner, founder, legal, or product decision
- `BLOCKED` — waiting on a prerequisite
- `VERIFY PROD` — code is complete but production deployment/indexing must be checked

## Baseline scores

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

## Current next actions after the production release

Continue in this order. Items that require owner access or genuine market evidence must not be closed with synthetic data.

1. `P0-08` / `M-01`–`M-03`: verify Google Search Console, submit the canonical sitemap and save indexing/query baselines.
2. `P0-09`: verify Bing Webmaster Tools, submit the sitemap and save URL Inspection evidence.
3. `P0-11` / `E-01`–`E-03`: create or verify official LinkedIn/GitHub company profiles, then add only verified URLs to `Organization.sameAs`.
4. `M-04` / `M-07`: connect the implemented privacy-safe AI/organic referral events to a durable analytics sink and conversion reporting.
5. `T-02`: complete a full Production crawl when stable crawler network access is available; resolve any broken links, orphans or unintended redirects found.
6. `T-03`: record mobile/desktop lab performance now and establish Search Console/CrUX monitoring once field data exists.
7. `P2-01` / `P2-02` / `E-08`: publish customer proof only after permission and measurable evidence exist.
8. `P2-08`–`P2-12`: create original research, partner/integration proof and legitimate third-party coverage.

## Positioning decision

Use this category hierarchy consistently:

1. Primary category: **Governed AI workforce platform**
2. Secondary descriptor: **AI company operating system**
3. Capability language: **AI Agents for business**, **multi-agent business operations**, **Company Memory**, **human-governed execution**

Avoid rotating the primary category among “AI company platform,” “virtual company,” “AI employees platform,” and “autonomous company.” Those terms may appear in explanatory or comparison content, but not as interchangeable product definitions.

## P0 — Search foundation

| ID | Status | Action | Acceptance criterion | Owner |
|---|---|---|---|---|
| P0-01 | DONE | Publish and validate `robots.txt` | HTTP 200; canonical sitemap declared; Google, Bing, OpenAI Search, Perplexity and Claude Search user agents can crawl public pages; private/API paths remain excluded | Engineering |
| P0-02 | DONE | Publish and validate `sitemap.xml` | HTTP 200; only canonical `https://rythm-os.com` URLs; About and all intentional public pages included; no auth/app routes | Engineering |
| P0-03 | DONE | Enforce legacy-host redirect | Every `company.rythm-os.com/:path*` and `www.rythm-os.com/:path*` URL returns one permanent redirect to the same apex path; no chain | Engineering |
| P0-04 | DONE | Remove legacy host from structured data and runtime fallbacks | No canonical, schema, sitemap, Open Graph, internal link or auth fallback identifies the legacy host as the brand URL | Engineering |
| P0-05 | DONE | Unify homepage category | Title, H1, lead paragraph and schema use “governed AI workforce platform”; secondary copy retains “AI company operating system” | Content + Engineering |
| P0-06 | DONE | Publish an official About page | `/about` defines product, audience, operator, Human CEO authority and Public Beta status; linked from footer and sitemap | Founder + Content |
| P0-07 | DONE | Strengthen entity graph | Organization, Brand, WebSite, WebApplication and founder nodes use stable IDs and the canonical domain; claims match public legal pages | Engineering + Founder |
| P0-08 | OWNER | Verify Google Search Console | Domain property verified; both sitemap and key URLs submitted; Page Indexing and manual-action baselines exported | Founder/Growth |
| P0-09 | OWNER | Verify Bing Webmaster Tools | Site verified; sitemap submitted; URL Inspection baseline saved | Founder/Growth |
| P0-10 | DONE | Validate deployed output | Check response codes, rendered HTML metadata/schema, mobile layout, robots, sitemap, redirect and internal links on Production | Engineering |
| P0-11 | OWNER | Create/verify official external entity profiles | Official LinkedIn company page and organization-level GitHub/profile URLs exist before adding them to Organization `sameAs` | Founder/Growth |

### Stage 1 local implementation log — 2026-09-01

Implemented on branch `feat/seo-geo-aeo-p0-foundation`:

- Added the persistent implementation roadmap.
- Reframed homepage title, H1, lead copy, Open Graph/X metadata and first-party AI reference files around “governed AI workforce platform.”
- Added `/about`, its unique metadata/canonical, sitemap entry and footer link.
- Consolidated Organization/Brand/WebSite/founder structured data on the apex domain and removed the stale legacy Brand URL.
- Added permanent same-path redirects for `company.rythm-os.com` and `www.rythm-os.com` in Next.js configuration.
- Updated hard-coded auth callback fallbacks from the legacy host to the canonical apex origin.
- Made public accessibility deliberate for Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot and Claude-User while retaining non-public path exclusions.

Local validation:

| Check | Result | Note |
|---|---|---|
| Targeted TypeScript check | PASS | All changed TypeScript/TSX files passed |
| Targeted ESLint | PASS | All changed TypeScript/TSX files passed |
| `git diff --check` | PASS | No whitespace errors |
| Legacy-host search in runtime/public code | PASS | No hard-coded legacy URL remains outside the redirect rule |
| Full `next build` | PASS IN CI | GitHub Actions run `33496623146` completed typecheck, lint, all configured test suites and the production build successfully |
| Vercel Preview | PASS | Deployment for remote head `6b86084f565d236122d92ce1cd868e85e9a45d9f` reached Ready |
| Production deployment | PASS | PR `#219` was squash-merged and Vercel marked production commit `0693065b3d859ac4aa0fca3be9b36f3770d1affc` successful |
| Production verification | PASS | Public routes and discovery files returned 200; legacy hosts returned one 301 to the same apex path; rendered About page had content, canonical, JSON-LD and no application error overlay |

The normal CI environment completed clean install, typecheck, lint, all configured tests and `next build`. Reproducible package-manager lockfile policy remains tracked as `T-10`.

### Stage 1 production verification commands/checks

- `https://rythm-os.com/robots.txt` returns 200 and names `https://rythm-os.com/sitemap.xml`.
- `https://rythm-os.com/sitemap.xml` returns 200 and includes `/about`.
- `https://company.rythm-os.com/product` permanently redirects to `https://rythm-os.com/product` without a chain.
- Homepage source contains one canonical, the revised title/description, one clear H1, and valid Organization/WebSite JSON-LD.
- `/about` returns 200, has unique metadata/canonical, is linked in the footer, and is usable on mobile.
- Google Rich Results Test and Schema.org validator report no blocking structured-data errors.

## P1 — Category, answer and conversion coverage

Implement in this order; each page must add original product facts, examples or decision support rather than thin keyword copy.

| ID | Status | Proposed URL | Purpose / primary query | Required content | Owner |
|---|---|---|---|---|---|
| P1-01 | DONE | `/ai-workforce` | Commercial category page: AI workforce platform | Definition, buyers, operating model, capabilities, governance, FAQ, demo/pricing links | Content |
| P1-02 | DONE | `/ai-agents-for-business` | AI agents for business | Role model, agent capabilities, human limits, examples, vs chatbots/automation | Content |
| P1-03 | DONE | `/how-it-works` | How RYTHM works | Intent → context → meeting → decision → approval → action → trace; screenshots and facts | Product + Content |
| P1-04 | DONE | `/product/ai-agents` | Individual AI Agent discovery hub | Available agent families, responsibilities, inputs, outputs, authority and escalation | Product + Content |
| P1-05 | DONE | `/product/integrations` | AI agent platform integrations | Current vs planned integrations, setup model, permissions, data boundaries; no unsupported claims | Product + Content |
| P1-06 | DONE | `/faq` | Direct-answer coverage | What is RYTHM, for whom, pricing, custom Agents, approvals, integrations, security, replacement claims | Content + Legal |
| P1-07 | DONE | `/docs` | First-party technical/product reference | Concepts, quick start, architecture, governance, Agent model, Company Memory, API/integration status | Engineering + Content |
| P1-08 | DONE | `/product-architecture` | Multi-agent business platform | Components, data/authority boundaries, orchestration, diagrams, current limits | Engineering + Content |
| P1-09 | DONE | `/use-cases` | AI workforce use cases | Hub that routes to substantive workflows and industries | Content |
| P1-10 | DONE | `/use-cases/startups` | AI team for startups | Validated workflows, roles, governance, implementation path | Content |
| P1-11 | DONE | `/use-cases/agencies` | AI workforce for agencies | Map to existing Advertising Agency template and governed delivery | Content |
| P1-12 | DONE | `/use-cases/software-companies` | AI agents for software companies | Map to existing Software Company template and governed delivery | Content |
| P1-13 | DONE | `/glossary` | Entity/definition coverage | AI workforce, AI Agent, agentic workflow, multi-agent system, Company Memory, human-in-the-loop | Content |
| P1-14 | DONE | `/security` | Improve existing security page | Add architecture evidence, control ownership, update date, reporting expectations and FAQs | Security + Content |
| P1-15 | DONE | `/pricing` | Improve existing pricing page | Add plain-language inclusions, limits, ideal buyer, implementation costs and pricing FAQs | Growth + Content |
| P1-16 | DONE | `/enterprise` | Improve enterprise intent match | Deployment model, governance review, integrations, security, implementation and procurement facts | Growth + Content |

### Stage 2 local implementation log — 2026-09-01

- Added 13 substantive category, product, documentation, use-case, FAQ and glossary routes with unique metadata, canonicals, visible breadcrumbs and WebPage/BreadcrumbList structured data.
- Improved Pricing, Enterprise, Security, Trust and Support with direct answers, reviewed dates and current Public Beta boundaries.
- Added privacy-safe AI-referral event detection for ChatGPT, Perplexity, Gemini, Microsoft Copilot and Claude. A durable analytics sink is still required for reporting.
- Added a fair comparison hub plus source-linked pages for Lindy, Relevance AI, CrewAI and Microsoft Copilot Studio. Competitor claims use official sources and a visible review date.
- Added an automated SEO/GEO/AEO contract test covering 25 critical public routes, crawler policy, canonical host, sitemap source, redirects, internal discovery links, comparison sources and AI referrers.
- Targeted TypeScript, ESLint, SEO contract and whitespace checks pass. Full CI, Preview deployment and Production route/render verification also pass.

## P2 — Proof, comparisons and authority

| ID | Status | Action | Acceptance criterion | Owner |
|---|---|---|---|---|
| P2-01 | TODO | Publish 2–3 verified customer stories | Named or permissioned customer, initial problem, implementation, workflow, measurable outcome and limitations | Founder/Growth |
| P2-02 | BLOCKED | Publish `/customers` hub | At least two substantive, verifiable stories exist | Content |
| P2-03 | DONE | Build comparison framework | Fair comparison criteria: organization model, governance, memory, approvals, integrations, execution, pricing; source every changing competitor fact | Content/Growth |
| P2-04 | DONE | Publish RYTHM vs Lindy | Commercial comparison aligned to AI employee/workforce intent | Content/Growth |
| P2-05 | DONE | Publish RYTHM vs Relevance AI | Commercial comparison aligned to AI workforce/multi-agent intent | Content/Growth |
| P2-06 | DONE | Publish RYTHM vs CrewAI | Explain platform vs framework and managed operating environment vs developer orchestration | Content/Engineering |
| P2-07 | DONE | Publish RYTHM vs Microsoft Copilot Studio | Enterprise governance/orchestration comparison with verified sources | Content/Growth |
| P2-08 | TODO | Create original benchmark/research asset | Reproducible AI workforce governance or multi-agent operations benchmark with methodology and data | Product/Growth |
| P2-09 | TODO | Earn relevant third-party coverage | Founder interviews, partner pages, technical write-ups and reputable AI/SaaS directories; no paid link schemes | Founder/Growth |
| P2-10 | TODO | Establish review presence | Accurate profiles on relevant software review platforms; request honest reviews from real users only | Growth |
| P2-11 | TODO | Publish integration/partner evidence | Each real integration gets a factual page and, where possible, a reciprocal partner listing | Growth/Engineering |
| P2-12 | TODO | Seed expert/community discovery | Useful demonstrations and transparent participation on LinkedIn, GitHub and relevant communities; never disguised promotion | Founder/Growth |

## Technical backlog

| ID | Status | Action | Owner |
|---|---|---|---|
| T-01 | DONE | Add automated SEO contract tests for public route metadata, canonical uniqueness, sitemap coverage, schema IDs and legacy-host absence | Engineering |
| T-02 | TODO | Run production crawl and resolve broken internal/external links, orphan pages and unexpected redirects | Engineering |
| T-03 | TODO | Measure Core Web Vitals with Search Console/CrUX once traffic is sufficient; use lab tests as diagnostics, not ranking claims | Engineering |
| T-04 | DONE | Audit image dimensions, formats, lazy-loading, `alt` text and total transfer size on key landing pages | Engineering/Content |
| T-05 | DONE | Add `BreadcrumbList` schema only to pages with visible hierarchical breadcrumbs | Engineering |
| T-06 | DONE | Keep FAQ answers visible and machine-readable without adding `FAQPage`; RYTHM is not in a current Google FAQ rich-result eligibility class | Engineering/Content |
| T-07 | TODO | Add `Article` schema, author and `datePublished/dateModified` to future editorial content | Engineering/Content |
| T-08 | DONE | Decide a deliberate training-crawler policy separately from search/user-agent crawling; document the privacy/visibility trade-off | Founder/Legal/Security |
| T-09 | TODO | Monitor sitemap/index coverage and redirect retirement for legacy-host URLs for at least 90 days | Growth/Engineering |
| T-10 | TODO | Commit the intended package-manager lockfile and require reproducible clean installs in CI | Engineering |

Image audit evidence (2026-09-01): public layouts use the shared `RythmBrandLogo` and `RythmBrandMark` through `next/image` with explicit intrinsic dimensions. The logo has descriptive alt text; the decorative mark uses `alt=""` plus `aria-hidden`. Active SVG assets are approximately 1.6–5.8 KB each and no raster landing-page image debt was found in the public route source.

## Entity and trust backlog

| ID | Status | Action | Owner |
|---|---|---|---|
| E-01 | OWNER | Create official LinkedIn company page with exact name, canonical URL, logo, category and description | Founder |
| E-02 | OWNER | Decide whether the GitHub organization should be renamed/created as a company-level entity | Founder/Engineering |
| E-03 | TODO | Add only verified organization profiles to `Organization.sameAs` | Engineering |
| E-04 | PARTIAL | Verified founder/operator identity and LinkedIn link are published; relevant-experience bio still requires founder-approved facts | Founder/Content |
| E-05 | DONE | Publish visible reviewed/updated dates on high-change trust, pricing, support, comparison and documentation pages | Content/Engineering |
| E-06 | TODO | Add status/uptime page when operational monitoring is ready for customers | Engineering |
| E-07 | DONE | Publish support expectations and incident communication process appropriate to Public Beta | Operations/Content |
| E-08 | TODO | Add verifiable testimonials, logos or proof only after permission and evidence are recorded | Founder/Growth |

## Measurement and reporting

| ID | Status | Metric | Cadence | Source |
|---|---|---|---|---|
| M-01 | OWNER | Indexed canonical URLs, exclusions and crawl errors | Weekly for 8 weeks, then monthly | Google Search Console |
| M-02 | OWNER | Branded clicks/impressions and query variants | Monthly | Google Search Console |
| M-03 | OWNER | Non-branded category impressions/clicks by landing page | Monthly | Google Search Console + Bing Webmaster Tools |
| M-04 | PARTIAL | AI referrer and landing-page event detection is implemented; connect a durable first-party analytics sink or server logs for monthly reporting | Monthly | First-party analytics/server logs |
| M-05 | TODO | Answer-engine mention/citation benchmark for a fixed prompt set | Monthly, same locale/session method | Manual reproducible test log |
| M-06 | TODO | New referring domains and unlinked brand mentions | Monthly | Reputable backlink/mention tool |
| M-07 | TODO | Demo, signup and qualified enterprise conversion by organic landing page | Monthly | First-party analytics/CRM |

## Fixed query/prompt benchmark

Retest with consistent locale, signed-out/private sessions where possible, and record the date and observable source. Never report a precise rank when it cannot be verified.

### Branded

- RYTHM Company OS
- RYTHM OS
- Rythm AI
- Rythm company OS
- site:rythm-os.com

### Commercial/non-branded

- AI workforce platform
- governed AI workforce platform
- AI agents for business
- AI employees platform
- AI company operating system
- multi-agent business platform
- build a company with AI agents
- autonomous company software
- enterprise AI agent platform
- human-in-the-loop AI agent platform

### Answer-engine prompts

- What are the best platforms for building a company with AI agents?
- What software can create an AI workforce for a business?
- What are the best governed AI workforce platforms?
- What are alternatives for running a virtual company with AI employees?
- How is an AI company operating system different from ChatGPT or automation software?
- Which AI agent platforms keep consequential approvals with a human executive?

## Definition of completion

This roadmap is not complete when pages merely exist. Completion requires:

1. Production technical validation and confirmed indexability.
2. Consistent product/entity language across first-party surfaces.
3. Substantive category, question and comparison coverage.
4. Verifiable third-party mentions and market proof.
5. Measurable growth in non-branded discovery, qualified organic conversions, and AI citations over repeated baselines.
