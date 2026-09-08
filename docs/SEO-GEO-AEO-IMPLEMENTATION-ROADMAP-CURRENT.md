# RYTHM OS — SEO, GEO & AEO Updated Roadmap

**Checkpoint:** 2026-09-08  
**Canonical Production:** `https://rythm-os.com`  
**Historical audit baseline:** 2026-09-01 — fixed, not a current score

## Current progress

Total original roadmap items: **66**.

- `DONE`: **54**
- `PARTIAL`: **8**
- `TODO/BLOCKED`: **4**
- Strict completion: **54/66 ≈ 81.8%**
- 50%-weighted operational progress: **≈87.9%**

Historical audit baseline remains:

| Area | Score |
|---|---:|
| SEO | 42 |
| GEO | 51 |
| AEO | 34 |
| Technical SEO | 73 |
| Content Authority | 38 |
| Entity Authority | 24 |
| Google Discoverability | 32 |
| AI Discoverability | 29 |

Baseline classification: **INDEXABLE BUT LOW AUTHORITY**.

These values are historical and must not be presented as current scores without a comparable reassessment.

## Completed original roadmap items

### Search foundation

P0-01 DONE — Robots & Crawler Access  
P0-02 DONE — Canonical Sitemap  
P0-03 DONE — Canonical Host Redirects  
P0-04 DONE — Legacy Host Removal  
P0-05 DONE — Primary Category Unification  
P0-06 DONE — About Page  
P0-07 DONE — Entity Structured Data  
P0-08 DONE — Google Search Console Setup  
P0-09 DONE — Bing Webmaster Setup  
P0-10 DONE — Production SEO Verification  
P0-11 DONE — Verified Organization Profiles

### Public content

P1-01 DONE — AI Workforce Page  
P1-02 DONE — AI Agents for Business Page  
P1-03 DONE — How It Works Page  
P1-04 DONE — Product AI Agents Page  
P1-05 DONE — Product Integrations Page  
P1-06 DONE — FAQ Page  
P1-07 DONE — Documentation Page  
P1-08 DONE — Product Architecture Page  
P1-09 DONE — Use Cases Hub  
P1-10 DONE — Startups Use Case  
P1-11 DONE — Agencies Use Case  
P1-12 DONE — Software Companies Use Case  
P1-13 DONE — Glossary  
P1-14 DONE — Security Content  
P1-15 DONE — Pricing Content  
P1-16 DONE — Enterprise Content

Primary category: **Governed AI workforce platform**.  
Secondary descriptor: **AI company operating system**.

### Proof & authority

P2-03 DONE — Fair Comparison Framework  
P2-04 DONE — RYTHM vs Lindy  
P2-05 DONE — RYTHM vs Relevance AI  
P2-06 DONE — RYTHM vs CrewAI  
P2-07 DONE — RYTHM vs Microsoft Copilot Studio  
P2-08 DONE — Original Governance / Multi-Agent Research  
P2-11 DONE — Integration / Partner Evidence  
P2-12 DONE — First real founder/expert community contribution published and public URL recorded

P2-12 evidence:  
`https://www.reddit.com/r/LocalLLaMA/comments/1sriyhd/comment/p7q1vqo/`

### Technical SEO

T-01 DONE — Automated SEO/GEO/AEO Contract Tests  
T-02 DONE — Full Production SEO Crawl  
T-04 DONE — Public Image Audit  
T-05 DONE — Breadcrumb Schema  
T-06 DONE — FAQ Structured Answers  
T-08 DONE — Crawler Policy  
T-10 DONE — Reproducible npm Installs  
T-11 DONE — IndexNow Automation  
T-12 DONE — Bing Live URL re-inspection; historical image-alt warning was not reproduced and Live URL reported no SEO/GEO issues

### Entity & trust

E-01 DONE — LinkedIn Company Page  
E-02 DONE — GitHub Organization Entity  
E-03 DONE — Organization `sameAs`  
E-04 DONE — Founder / Operator Authority Profile  
E-05 DONE — Reviewed / Updated Dates  
E-06 DONE — Public Status / Uptime Page  
E-07 DONE — Support & Incident Expectations

### Measurement

M-04 DONE — Referral Attribution Analytics  
M-05 DONE — Answer-engine benchmark completed with **24/24 observations, 0/24 RYTHM mentions, 0/24 RYTHM citations**  
M-07 DONE — Confirmed Conversion Attribution

## Remaining original roadmap items

### TODO / BLOCKED

P2-01 TODO — Permissioned Customer Stories  
P2-02 BLOCKED — Customers Hub; requires at least two verified substantive customer stories  
T-07 TODO — Article schema; only when genuine editorial/article content launches  
E-08 TODO — Testimonials / Logos / Proof Permissions

### PARTIAL

P2-09 PARTIAL — Independent third-party coverage / listings  
P2-10 PARTIAL — Capterra review-platform presence; submission under editorial review  
T-03 PARTIAL — Core Web Vitals field monitoring; lab baseline exists, CrUX/field data pending  
T-09 PARTIAL — 90-day index / legacy-host monitoring  
M-01 PARTIAL — Indexed URL monitoring  
M-02 PARTIAL — Branded search visibility trend  
M-03 PARTIAL — Non-branded category visibility trend  
M-06 PARTIAL — Referring-domain / authority reporting; explicit backlink-source data still required

## GEO / AEO execution completed after the original roadmap

These implementation waves were added after the 66-item roadmap and therefore do not change the denominator.

### Wave 1 — Category and entity association

Completed:

- Homepage explicitly positions RYTHM as a **governed AI workforce platform** and **AI company operating system**.
- Added `/ai-company-operating-system`.
- Clarified differences from ChatGPT, n8n/Zapier, LangGraph/CrewAI, and Microsoft Copilot Studio.
- Added FAQ/WebPage structured data.
- Added sitemap exposure.

### Wave 2 — Metadata normalization

Completed:

- Normalized AI Company Operating System metadata.
- Added page-specific Open Graph and Twitter metadata.

### Wave 3 — Business-native / no-AI-expertise positioning

Completed:

- Added messaging that ordinary business users can operate RYTHM through familiar company concepts.
- Core message: **Run an AI workforce like you run a company—not like you build an AI system.**
- Explicitly states users do not need to understand orchestration frameworks, model routing, MCP, or AI runtime design.
- Added across Homepage, Product, How It Works, and AI Company Operating System.
- Added structured FAQ signal.

### Wave 4 — Entity graph, schema and semantic linking

Completed and merged in PR `#250`:

- Strengthened Organization entity semantics.
- Enriched WebApplication/Product entity semantics.
- Added FAQPage structured data to public knowledge pages.
- Added semantic internal links across AI workforce, company OS, Agents, architecture, How It Works, and comparisons.
- Merge commit: `7875ead0e154e96b1f6067c41dab80cab819dfc6`.

### Wave 5 — Answer-first intent and comparison coverage

Completed and merged through PRs `#251` and `#252`:

- Added `/ai-workforce-software` targeting the benchmark intent **What software can create an AI workforce for a business?**
- Added direct-answer coverage for governed AI workforce platforms, building a company with AI agents, and virtual companies with AI employees.
- Added source-linked RYTHM comparison coverage for n8n and LangGraph using official competitor documentation.
- Added FAQ/WebPage structured data and sitemap exposure.
- PR `#251` merge commit: `db62ad9961dcc5c62cdc6744cf08704badd182ae`.
- PR `#252` merge commit: `7fcb7af6d2282c3a1c5381fc10f294d480f6b5a1`.

## Answer-engine benchmark evidence

The initial pre-optimization benchmark captured four fixed-category prompts across four engines:

1. What are the best platforms for building a company with AI agents?
2. What software can create an AI workforce for a business?
3. What are the best governed AI workforce platforms?
4. What are alternatives for running a virtual company with AI employees?

Original baseline observation:

- Mentions: **0/16**
- Citations: **0/16**

The completed M-05 benchmark checkpoint now contains:

- Observations: **24/24**
- RYTHM mentions: **0/24**
- RYTHM citations: **0/24**

Do not overwrite the historical `0/16` baseline with the completed `0/24` checkpoint; they represent different benchmark scopes.

## External Authority / Third-Party Presence — Wave 1

Current evidence as of 2026-09-08:

- **SaaSHub — LIVE**: public page independently opened and product verification confirmed; backlink not verified.
- **AlternativeTo — PENDING REVIEW**: application accepted into the normal free review queue; no public app page verified yet.
- **Uneed — SUBMITTED**: authenticated waiting-line record exists; no paid launch option selected; no public listing verified yet.
- **SubmitStartup.io — PENDING REVIEW**: submission accepted into free review queue; no public listing verified yet.
- **FreeStartupDirectories — APPROVED**: publisher email states the listing is approved and live and provides `https://freestartupdirectories.com/tool/rythm-company-os`; independent public-page inspection is still required before marking `LIVE` or confirming backlink type.
- **Launchory — BLOCKED**: repeated unstable slug/verification behavior ended in `Listing not found`; badge removed from RYTHM production and no payment made.

P2-09 remains `PARTIAL` until more of these third-party records are independently verifiable as public/live listings.

## Product Hunt launch integrity

Product Hunt launch-day execution remains scheduled separately for **2026-09-15 at 09:01 Budapest time**.

A paid-upvote solicitation from Upvote.Network was received on 2026-09-08 offering approximately 300 profiles at `$1/upvote` and citing a claimed Product Hunt rank. This solicitation is **not authorized for use**. No paid votes, purchased upvotes, coordinated fake profiles, ranking manipulation, or similar services should be used for the RYTHM launch.

## Monitoring status

- T-09 monitoring evidence has been recorded and remains ongoing.
- M-01 indexed URL monitoring evidence has been recorded and remains ongoing.
- M-02 branded visibility monitoring evidence has been recorded and remains ongoing.
- M-03 non-branded category visibility monitoring evidence has been recorded and remains ongoing.
- M-06 remains `PARTIAL` because explicit backlink/referring-domain evidence is still required. Google Search Console Links was previously still processing data.

## Next actions in priority order

1. Continue `M-01 / M-02 / M-03 / T-09` recurring monitoring without resetting prior evidence.
2. Re-check `P2-09` Wave 1 listings as approvals arrive and independently verify public URLs and backlink presence/type.
3. Verify Capterra public listing if/when approved.
4. Complete `M-06` when Search Console Links or another explicit backlink/referring-domain source becomes available.
5. Add CrUX/Search Console field monitoring when sufficient real-user data exists.
6. Publish customer proof only when permission and evidence exist.
7. Add Article schema only when genuine editorial content exists.

## Evidence rules

Never fabricate rankings, backlinks or authority scores, reviews, customer outcomes, uptime percentages, AI citations, third-party coverage, or partnerships.

A real-world dependency remains `PARTIAL` until evidence exists. Ordinary web search does not substitute for an answer-engine benchmark or exhaustive backlink source. Customer proof requires explicit permission and evidence.

Do not purchase votes, upvotes, fake engagement, review manipulation, or ranking-manipulation services. Third-party approval emails may establish `APPROVED`, but `LIVE` and backlink presence/type should be recorded only after the actual public page is independently inspected.
