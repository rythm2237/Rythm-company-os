# W19 — Business Discovery verification record

## Baseline and release boundary
Application main and Production deployment were both `8f239106c9b14e1eb2954ed5a3a7de544061667b`, Vercel deployment `dpl_E4kZ4CG2nKpc8dkr4HPA5yxm6wcZ`. W10 was separately released in PR #457. W18 paid beta remains NO-GO. Hosted staging was inactive; no hosted fixture writes, external AI, migration or Production release. Feature-flag inventory returned 403; do not interpret this as absent flags.

## Verified first candidate
Commit `9940e1dca94af29542c82533ebd10d49f804bb8a`: [CI](https://github.com/rythm2237/Rythm-company-os/actions/runs/46123802059) and [disposable schema](https://github.com/rythm2237/Rythm-company-os/actions/runs/46123802005) both SUCCESS, including W19 unit, typecheck, lint, build and CRM browser. Job 140913813613 emitted these W19_BENCHMARK results from actual Playwright, disposable Auth/PostgreSQL and synthetic billing, with live AI false.

| Device | Before fields | After fields | Before required text | After required text | Before actions | After actions | Before profile ms | After profile ms | Before signup-to-confirmation ms | After signup-to-confirmation ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Desktop |18|6|3|2|4|5|953|986|7355|5164|
| Mobile |18|6|3|2|4|5|4564|2787|7900|6841|

These are automated path timings, not human usability measurements. Only one baseline/candidate run per device; total path includes candidate checks and order effects; no general speed claim. Actions increased due to explicit consent. Source checks and browser tests passed tenant isolation, correction/reset and overflow assertions. The full software template provisioning was not part of this Agency harness; existing software regression and template-specific unit assertions ran in CI.

## Follow-up hardening
Narrow context inference to explicit self-described offerings or known service lists; avoid inferred competitor, future, negated comma-list and SaaS-only services. Preserve manual entry and explicit approval. Extend actual disposable browser checks to native validation, stale server-action failure, no profile or audit mutation on failure, and persisted service override on both devices. Follow-up tests pending; historical results above apply only to first candidate.

## Review before release
- Check exact latest head CI/disposable regression and benchmark artifacts.
- Check actual human usability with target personas before public launch; no claim of human speed improvement.
- No production mutation or customer activation until explicit owner approval; W18 gate remains intact.
- Existing operating defaults retained, not inferred from geography; only English rule vocabulary is supported.
- Confirm acceptance of non-atomic profile and audit writes (failure leaves profile unconfirmed; retry supported) and storage in mission text rather than schema fields.
- Resolve hosted feature flag visibility and staging parity as release prerequisites.
- Rollback pre-release: close draft PR #474. After a separately approved release, revert W19 application changes while preserving customer-confirmed profiles/audit; no migration rollback needed.
