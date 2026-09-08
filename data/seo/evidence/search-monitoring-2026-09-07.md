# Search / indexing monitoring evidence — 2026-09-07

Scope: recurring evidence for T-09, M-01, M-02 and M-03. This is not a replacement for Google Search Console export data or exhaustive rank tracking.

## Canonical-domain discoverability

Observed public search retrieval on 2026-09-07 showed canonical `https://rythm-os.com` pages discoverable, including:

- `/`
- `/ai-company-operating-system`
- `/about`
- `/product`
- `/how-it-works`
- `/ai-workforce`
- `/docs`
- `/product-architecture`
- `/use-cases/startups`
- `/ai-agents-for-business`
- `/pricing`
- `/terms`
- `/legal`

This supports continued M-01 monitoring but is not an exhaustive indexed-URL count.

## Branded visibility

Queries containing the RYTHM brand retrieved the canonical domain prominently. This is a positive branded-discoverability observation for M-02, but no formal Google position/rank is claimed without a consistent rank-tracking surface.

## Non-branded category visibility

For category-level searches without the RYTHM brand, RYTHM was observed as a retrievable result for category language including `governed AI workforce platform` and `AI company operating system`.

Competing results were also present, including Arcena, AgentOS, Metis, Aexy and other category-adjacent products/content. This supports M-03 trend monitoring but does not establish a stable ranking position or share of voice.

## Legacy-host monitoring

The legacy host `https://company.rythm-os.com` still appeared in search-result retrieval for some previously indexed URLs such as `/terms`, `/security`, `/consumer-terms`, and `/withdrawal`.

Direct requests to tested legacy URLs redirected to the canonical equivalents on `https://rythm-os.com`, including:

- `https://company.rythm-os.com/` -> `https://rythm-os.com/`
- `https://company.rythm-os.com/security` -> `https://rythm-os.com/security`
- `https://company.rythm-os.com/terms` -> `https://rythm-os.com/terms`

Interpretation: redirect behavior is working, but stale legacy-host search visibility has not fully decayed. T-09 therefore remains PARTIAL and should continue through the planned monitoring window.

## Core Web Vitals

No reliable CrUX/field-data evidence was obtained in this observation. T-03 remains PARTIAL; lab data must not be presented as field performance.

## Evidence discipline

- No indexed-URL total is inferred from ordinary web search.
- No formal ranking position is claimed.
- No Search Console impression/click data is inferred.
- No Core Web Vitals field pass/fail is claimed without CrUX/GSC field data.
- Legacy-host snippets are treated as stale-index evidence even where redirects are correct.
