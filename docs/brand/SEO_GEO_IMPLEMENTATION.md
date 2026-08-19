# RYTHM SEO and Generative Search implementation

This release installs the production brand identity and the technical discovery layer for search engines and generative search experiences.

## Implemented

- Canonical URLs for every indexable public route
- Unique page titles and descriptions
- Open Graph and X/Twitter metadata with a 1200 x 630 brand image
- `Organization` and `WebSite` JSON-LD on the homepage
- `WebApplication` JSON-LD on the Product page
- Crawlable organization logo larger than Google's 112 x 112 minimum
- Public-only XML sitemap
- Robots policy with public crawling enabled and internal API/callback paths excluded
- PWA manifest, theme colors, favicon, SVG icon, Apple Touch icon, and 192/512 icons
- Explicit `noindex, nofollow` boundaries on authentication and tenant application layouts
- Semantic public content and crawlable internal navigation
- Brand assets with fixed dimensions to avoid layout shift
- Permanent redirects from legacy `company` and `www` hostnames to the canonical apex hostname

## Indexable public routes

- `/`
- `/product`
- `/demo`
- `/solutions`
- `/templates`
- `/pricing`
- `/enterprise`
- `/live-ai-meeting`
- `/trust`
- `/security`
- `/support`
- `/contact`
- `/legal`
- `/privacy`
- `/terms`
- `/consumer-rights`
- `/consumer-terms`
- `/withdrawal`
- `/cookies`
- `/dpa`
- `/subprocessors`
- `/data-requests`
- `/ai-transparency`

Tenant, authentication, provisioning, and commercial mutation routes are intentionally excluded from the sitemap. SEO configuration does not weaken authentication, RLS, tenancy, or entitlement enforcement.

## GEO approach

Google states that AI Overviews and AI Mode do not require a special AI file or dedicated schema. Eligibility depends on normal Search indexing, accessible textual content, internal links, page experience, and structured data that matches visible content. For that reason, the public discovery layer prioritizes normal crawlability and factual structured data over speculative AI-specific markup.

## Canonical domain

The production canonical origin is `https://rythm-os.com`. Legacy traffic from `https://company.rythm-os.com` and `https://www.rythm-os.com` permanently redirects path-for-path to the apex domain.

## Google Search Console strategy

Prefer a Domain property named `rythm-os.com` (without `https://`). A Domain property covers the apex hostname, `www`, `company`, all other subdomains, and both HTTP/HTTPS variants. Domain-property verification is DNS-based, so the existing Google verification TXT record at the apex should be retained.

If Search Console also contains a separate old domain-level property for `company.rythm-os.com`, use Search Console's Change of Address tool after the permanent redirects are live to declare the move to `rythm-os.com`. Keep the old redirects in place for at least one year and preferably indefinitely.

## Post-deployment operational steps

These actions require the relevant external webmaster account and are not code changes:

1. Confirm that the `rythm-os.com` Domain property is verified in Google Search Console. If only a URL-prefix property exists, add the Domain property.
2. Submit `https://rythm-os.com/sitemap.xml` in the `rythm-os.com` property.
3. If a separate `company.rythm-os.com` property exists, submit Change of Address from that property to `rythm-os.com`.
4. Run URL Inspection for `/`, `/product`, `/demo`, `/pricing`, and `/contact`, and request indexing where appropriate.
5. Validate the homepage and Product page structured data with Google's Rich Results Test and Schema Markup Validator.
6. Import the verified site into Bing Webmaster Tools and submit the same sitemap.
7. Monitor Page Indexing, Crawl Stats, Core Web Vitals, and Search performance during the migration window.

## Primary references

- Google AI features: https://developers.google.com/search/docs/appearance/ai-features
- Google Organization structured data: https://developers.google.com/search/docs/appearance/structured-data/organization
- Google Search Essentials: https://developers.google.com/search/docs/essentials
- Google site moves: https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes
- Google Search Console Change of Address: https://support.google.com/webmasters/answer/9370220
- Next.js metadata files: https://nextjs.org/docs/app/api-reference/file-conventions/metadata
