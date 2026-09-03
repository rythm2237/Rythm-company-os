# M-06 — Referring-Domain / Authority Reporting

Checkpoint: 2026-09-03
Status: PARTIAL

## Acceptance boundary

M-06 is a measurement task, not a link-building claim. It is complete only when RYTHM has a repeatable source of backlink/referring-domain evidence and recurring snapshots are logged without invented metrics.

## Current baseline

A fresh public-web discovery pass on 2026-09-03 using exact brand/domain queries did not surface a verifiable unaffiliated referring page linking to `https://rythm-os.com`.

This does **not** prove that the backlink count is zero. General web search is incomplete as a backlink index. Therefore the baseline is recorded as:

- independently verified referring domains from current public discovery: `0`
- exhaustive referring-domain count: `unknown`
- Domain Rating / Domain Authority / equivalent vendor scores: `not measured`
- paid/sponsored placements: `0 verified`

## Measurement rules

1. Count a referring domain only when a live public third-party URL linking to a canonical `rythm-os.com` URL is directly verified.
2. Do not count RYTHM-owned domains, GitHub repositories controlled by RYTHM, the RYTHM LinkedIn company page, internal redirects, search-result URLs, scraper copies, or cached legacy-host pages as independent authority.
3. Keep `follow`, `nofollow`, `sponsored`, and `ugc` relationships distinct when observable.
4. Keep editorial coverage, directories/review platforms, community posts, partner listings, and customer references as separate source types.
5. Vendor authority scores such as Ahrefs DR or Moz DA may be recorded only with tool/date evidence; never estimate or translate between vendors.
6. Public-search discovery is useful for finding candidates but must not be reported as an exhaustive backlink count.
7. Every recorded row requires a source URL, target URL, observed date, source type, relationship, and evidence status.

## Recurring cadence

Recommended baseline cadence: monthly, plus an ad-hoc snapshot after a material launch or external publication.

For each wave record:

- verified referring domains
- newly verified domains
- lost/removed links when evidenced
- source-type mix
- destination pages
- sponsored/paid disclosure where applicable
- vendor authority metrics only when sourced directly

## Current dependency

To upgrade M-06 from PARTIAL to DONE, connect or provide evidence from a backlink-index source (for example Search Console Links, Ahrefs, Semrush, Moz, Majestic or an equivalent export) and retain recurring dated snapshots. Search Console may under-report compared with commercial indexes, so source identity must remain attached to every metric.

## Data register

Canonical evidence register: `data/seo/referring-domain-authority.csv`.

Validation guard: `scripts/validate-referring-domain-authority.mjs`.

The register may be empty when no external referring page has been independently verified. An empty evidence register is preferable to synthetic authority data.
