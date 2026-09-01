# RYTHM public AI crawler policy

Policy date: 2026-09-01  
Applies to: public content on `https://rythm-os.com`

## Decision

RYTHM currently allows reputable search, answer-engine user fetch, and model-training crawlers to access public marketing, documentation, trust, legal, and product-reference content.

Explicitly supported discovery/fetch agents include:

- Googlebot
- Bingbot
- OAI-SearchBot and ChatGPT-User
- PerplexityBot and Perplexity-User
- Claude-SearchBot and Claude-User

Training crawlers explicitly allowed for the current public-content strategy:

- GPTBot
- ClaudeBot

This choice is intended to maximize early brand/category understanding for a Public Beta whose public pages contain no customer workspace data. Search/fetch access and training access are separate decisions and must be reviewed at least quarterly or when legal, licensing, infrastructure-load, or content strategy changes.

## Boundaries

- `/api/`, authentication callbacks, and organization-context paths remain excluded from crawler access.
- Authentication, authorization, tenant isolation, Row Level Security and `noindex` application layouts—not `robots.txt`—protect non-public customer data.
- Public crawler access never authorizes access to a customer account, private document, credential, tool connection, or tenant application route.
- If original licensed or customer-supplied content is later published, its crawl/training policy must be reviewed before release.
- Crawler identity should be verified using official IP ranges or documented verification methods before WAF allowlisting.

## Sources of truth

- Runtime policy: `app/robots.ts`
- Public index policy: root and route metadata
- Canonical public inventory: `lib/seo/site.ts` and `app/sitemap.ts`
- Private application boundaries: authentication/application layouts, middleware, authorization and database controls
