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

## Indexable public routes

- `/`
- `/product`
- `/demo`
- `/solutions`
- `/templates`
- `/pricing`
- `/enterprise`
- `/live-ai-meeting`

Tenant, authentication, provisioning, and commercial mutation routes are intentionally excluded from the sitemap. SEO configuration does not weaken authentication, RLS, tenancy, or entitlement enforcement.

## GEO approach

Google states that AI Overviews and AI Mode do not require a special AI file or dedicated schema. Eligibility depends on normal Search indexing, accessible textual content, internal links, page experience, and structured data that matches visible content. For that reason, this implementation does not add speculative `llms.txt` claims or unsupported AI-specific markup.

## Post-deployment operational steps

These actions require the relevant external webmaster account and are not code changes:

1. Verify `https://company.rythm-os.com` in Google Search Console.
2. Submit `https://company.rythm-os.com/sitemap.xml`.
3. Run URL Inspection for `/`, `/product`, `/demo`, and `/pricing` and request indexing.
4. Validate the homepage and Product page with Google Rich Results Test and Schema Markup Validator.
5. Import the verified site into Bing Webmaster Tools and submit the same sitemap.
6. Monitor Core Web Vitals and the Search Generative AI performance report when available for the property.

## Primary references

- Google AI features: https://developers.google.com/search/docs/appearance/ai-features
- Google Organization structured data: https://developers.google.com/search/docs/appearance/structured-data/organization
- Google Search Essentials: https://developers.google.com/search/docs/essentials
- Next.js metadata files: https://nextjs.org/docs/app/api-reference/file-conventions/metadata
