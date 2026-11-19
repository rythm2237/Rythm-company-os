# W10 — live-catalog schema rehearsal, 2026-11-19

**PASS: the remaining application-schema migration rehearsal gate is satisfied.** This supersedes the missing-export HOLD in the earlier release review. No production change or release authorization is implied.

## What was actually copied
The Supabase SQL connector executed SELECT-only catalog queries against production `dezbacyuvsdrlpmmpjht`. No database password, new key, database URL, customer rows or auth users/sessions were exported. Definition metadata for `public`, `auth`, `storage` and the required `crm_private` schema was transported privately to an offline PostgreSQL engine. Definition payloads remain outside the repository; only extraction code, hashes, counts and test results are committed.

The original blocker was lack of a direct dump connection. It was resolved through a catalog exporter, not through a fabricated snapshot, credential reset, production DDL transaction or paid branch. Full source metadata was re-read after rehearsal and remained equal.

## Equality before forward migrations and after inverse
| Catalog group | Count | Before / after inverse |
| --- | ---: | --- |
| Tables (214 public, 37 Auth/Storage) | 251 | Equal / equal |
| Functions, including private CRM dependencies | 296 | Equal / equal |
| Enum types, preserving label order | 15 | Equal / equal |
| Views, including security options | 4 | Equal / equal |
| Non-constraint indexes | 400 | Equal / equal |
| Constraints | 1531 | Equal / equal |
| RLS policies | 360 | Equal / equal |
| Application triggers and enabled states | 153 | Equal / equal |
| Sequence structure | 5 | Equal / equal |
| Relation grants | 6046 | Equal / equal |
| Function grants | 759 | Equal / equal |
| Column grants | 81 | Equal / equal |
| Schema ownership/grants | 38 | Equal / equal |
| Per-schema default grants | 168 | Equal / equal |

Equality includes column order/type/nullability/default/generated expressions/explicit collation, enum label order, routine definitions/owners/identity arguments, PK/FK/check/exclusion definitions, RLS enable/force flags, policy expressions/roles and grant options. Arrays representing sets are sorted; ordered columns and enum labels are not reordered.

Canonical source catalog SHA-256:
`149bcc6e7613aacd8fb814f500be406a1e892bfb03bb873a8014e8e995d1add0`.

## Executed checks
1. Recreate the captured catalog, required extensions, roles and ownership; require exact captured catalog and ACL equality before proceeding.
2. Seed **synthetic** product lookup rows for the five tested Agency bindings and three specialization keys. No production product/customer data was copied.
3. Execute all **ten exact forward migration payloads** in the committed [checksum manifest](evidence/w10-2026-11-19-migration-manifest.json). Every checksum and execution passed. Assert all five specialization changes.
4. Assert actual new RPC ACLs: authenticated Owner-assignment entry point available; anon denied; service-only completion available; authenticated completion denied.
5. Execute [installed-schema role smoke](../../scripts/w10-hosted-schema-role-smoke.sql) under real database roles. Synthetic Owner positive control, viewer/foreign Owner assignment denial, foreign project invisibility, unleased meeting denial, leased native meeting start/completion with minutes, foreign worker completion denial, persisted atomic task/action output and immutable completed action all passed. Original triggers, private CRM functions and policies remain enabled.
6. Roll back all synthetic user/tenant/workflow smoke records. Product lookup fixtures use the original full completion-gate defaults; no completion criteria or approval gates were weakened.
7. Execute the captured inverse SQL. Require the entire captured catalog, schema/default ACLs and five prior template specialization arrays to equal the original baseline. Assert zero remaining synthetic auth users and organizations.
8. Re-read the live source catalogs: unchanged.
9. Reject a PostgreSQL 18 execution attempt with exit 1 before schema creation. The final PostgreSQL 17 run exits 0; failed checks cannot be converted to a passing exit by engine cleanup.

Results: [structured evidence](evidence/w10-2026-11-19-hosted-schema-rehearsal.json). The private in-memory database is closed after each run. No provider calls, external sends, cron invocation or infrastructure purchase occurred. The final rehearsal runtime made zero network calls; catalog extraction used the authorized read-only connector.

## Reproducible commands
The repository's existing PGlite dependency currently uses PostgreSQL 18. Rehearsal therefore uses an isolated pinned `@electric-sql/pglite@0.4.2` installation, **without modifying package.json/package-lock.json or production dependencies**. The engine reports PostgreSQL **17.5**; the source reports **17.6**. Major-version guard is enforced.

```sh
npm install --prefix ../w10-pg17 --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.4.2
node --check scripts/rehearse-w10-hosted-schema.mjs
W10_PGLITE_MODULE=file:///workspace/scratch/ceb65cf6d403/w10-pg17/node_modules/@electric-sql/pglite/dist/index.js node scripts/rehearse-w10-hosted-schema.mjs ../w10-hosted-catalog.private.json ../w10-hosted-extra.private.json ../w10-hosted-catalog-query.private.sql ../w10-hosted-clone-summary.json
```

Inputs are generated by [catalog export](../../scripts/w10-export-hosted-catalog.sql) and [supporting export](../../scripts/w10-export-hosted-supporting-catalog.sql); extract the returned snapshot/metadata objects privately and use the catalog SELECT as the query input. Never commit raw catalog payloads, passwords or connection strings. The absolute module path above is the actually executed command; adjust only that local package path when reproducing.

Early exporter attempts exposed ordering/coverage requirements, not application defects: unique indexes referenced by FKs must precede FKs; private CRM routines, column grants and explicit collations must be included. An initial default PostgreSQL 18 engine was rejected for the final proof. Empty-schema smoke also required synthetic Associate-level and full-gate completion-policy lookup fixtures. No business records were patched to success.

## Limits and release disposition
This is an exact comparison of the enumerated **application catalog representation**, not a byte-identical managed Supabase installation. Managed Vault/Net/Cron/Realtime/GraphQL services, transport authentication, login capability, extension-internal objects, sequence current values, existing customer data and physical storage are not copied. The offline engine uses the same PostgreSQL major with a different patch/architecture; this is not a hosted performance/load proof.

The W10 migrations affect the enumerated application routines/policies/grants and five template arrays. Actual real-browser Auth/API/refresh/re-login and Human CEO journey proof remains the separate real Supabase desktop/mobile run [44480348458](https://github.com/rythm2237/Rythm-company-os/actions/runs/44480348458), accepted by the owner. No application code changed during this rehearsal.

Together with that native journey and the live preflight, the targeted forward/inverse migration gate is **PASS**. Production rollout still requires separate owner authorization, fresh just-in-time baseline/affected-state capture, worker quiescence, schema-first deployment and checks before restoring the scheduler. Production customer-data backup/DR was not repeated here; no claim about a fresh full backup is made.
