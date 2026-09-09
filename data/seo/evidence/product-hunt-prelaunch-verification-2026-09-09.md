# Product Hunt pre-launch SEO / GEO / AEO verification — 2026-09-09

Launch date: 2026-09-15 09:01 Europe/Budapest
Canonical production: https://rythm-os.com

## Result

Pre-launch technical/content gate: **PASS WITH EXTERNAL DEPENDENCIES**.

No blocking SEO/GEO/AEO defect was found in the verified production/search surface or current source configuration. External dependencies remain separate: Product Hunt live URL does not exist until launch, some third-party directory approvals are still pending, M-06 backlink reporting is still waiting for explicit referring-domain data, and T-03 field CWV data is still unavailable.

## Production/search verification

Fresh public search/fetch observations on 2026-09-09 confirmed accessible/crawl-visible RYTHM pages including:

- https://rythm-os.com/
- https://rythm-os.com/product
- https://rythm-os.com/about
- https://rythm-os.com/faq
- https://rythm-os.com/docs
- https://rythm-os.com/pricing

The homepage currently exposes the launch positioning consistently:

- governed AI workforce platform
- AI company operating system
- Human CEO authority
- no AI expertise required to operate
- business-native positioning: "Run an AI workforce like you run a company—not like you build an AI system."

No contradictory canonical domain was observed in the checked public results.

## Canonical and metadata source verification

Current source uses `SITE_ORIGIN = "https://rythm-os.com"` as the canonical origin.

`createPublicMetadata()` supplies page-specific canonical metadata, Open Graph metadata, Twitter card metadata, a shared 1200x630 social image, and canonical paths resolved against the canonical origin.

Root metadata keeps public pages indexable/followable and allows large image/snippet previews.

## Robots verification

`app/robots.ts` currently:

- allows `/` for general crawlers;
- blocks authenticated/non-public application paths;
- explicitly permits Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, PerplexityBot / Perplexity-User, Claude search/user crawlers, GPTBot, and ClaudeBot on public paths;
- declares `https://rythm-os.com/sitemap.xml`;
- declares the canonical host.

No launch-blocking crawler rule was found.

## Sitemap verification

`app/sitemap.ts` exposes the public route inventory plus the current answer-first / GEO pages, including:

- `/ai-company-operating-system`
- `/ai-workforce-software`
- `/governed-ai-workforce-platforms`
- `/ai-company-operating-system-vs-chatgpt-automation`
- `/human-approval-ai-agents`
- `/platforms-for-building-company-with-ai-agents`
- `/virtual-company-ai-employees`
- `/compare/n8n`
- `/compare/langgraph`
- `/research/governed-ai-workforce-benchmark`
- `/press`
- `/status`

No obvious omission was found among the current high-priority launch/category pages.

## Structured-data verification

Homepage source mounts `OrganizationStructuredData`.

That component emits `application/ld+json` from the shared organization graph and adds:

- verified organization profile references;
- the core RYTHM slogan;
- subject links to category pages;
- the canonical organization/site entity relationship.

This checkpoint verifies source wiring, not a Google Rich Results eligibility claim.

## Launch-day constraints

The following must happen only after the Product Hunt page is actually public:

1. Open and verify the real Product Hunt listing URL.
2. Confirm the listing links to `https://rythm-os.com` as the canonical website.
3. Record timestamp, ranking/upvotes/comments only from observed Product Hunt data.
4. Capture referral traffic and conversions separately from analytics evidence.
5. Do not use paid upvotes, vote-exchange profiles, fake engagement, or ranking-manipulation services.

## External dependencies that remain open

- `P2-09`: third-party authority listings remain partially pending.
- `P2-10`: Capterra remains under review / unverified publicly.
- `T-03`: CrUX/Core Web Vitals field data not yet available.
- `M-06`: explicit backlink/referring-domain data still pending.
- `T-09 / M-01 / M-02 / M-03`: recurring monitoring continues.

## Evidence rule

This is a pre-launch readiness checkpoint, not a claim of Product Hunt publication, ranking, backlink acquisition, traffic, conversions, or current SEO/GEO/AEO scores.