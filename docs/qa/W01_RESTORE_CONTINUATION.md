# W01 private schema restore continuation — updated 2026-10-26

**W01 NOT ACCEPTED. No merge or production mutation is authorized.**

## Owner-authorized availability cycle and matrix rerun — 2026-10-26

The owner explicitly authorized temporary pauses of ai roadmap whenever required
for W01 testing, with reactivation after testing. That authorization resolves the
active-free-project capacity decision for future test cycles; no repeated
permission question is required for the same temporary switch.

ai roadmap was paused, staging was restored to ACTIVE_HEALTHY, and the retained
full matrix was executed again inside a subtransaction that rolled back all
synthetic fixtures. Actual result: 23 actors, 3 companies, 1000 checks, 1000 PASS,
zero failures. Sanitized result is retained as
`w01_qa_evidence.results.post_restore_db_matrix`.

Independent post-run checks: 214 RLS tables, zero client TRUNCATE relations,
zero public organizations, zero Auth sessions, jobs, Vault secrets and outbound
queue; helper schema absent. The single preserved legacy Auth identity remains.
No new real HTTP, expired-token, signed-in browser or privileged-backend result
is claimed by this database-role rerun.

After testing, staging was paused and ai roadmap restored to ACTIVE_HEALTHY;
a database SELECT 1 readiness check succeeded. Production was not changed.
Overall W01 remains NOT_ACCEPTED. The dedicated staging-only server key is
still absent, and the historical replay/browser/correctly-signed-expiry gates
remain unresolved. The connector has no Auth configuration or server-key
retrieval tool; no JWT signing secret was extracted as a workaround.

## Environment availability after owner-requested switch — 2026-10-26

The owner requested reactivating `ai roadmap`. W01 staging
(`viqjdgohtxqkrdgwtull`) was paused to free the free-plan project slot.
`ai roadmap` (`dqpdyschjpbdhhotmojs`) is now ACTIVE_HEALTHY and its database
readiness query succeeded. Production Rythm was not paused or changed.

The retained Preview configuration still targets staging, which is currently
INACTIVE. The earlier successful Preview/HTTP results below are historical
execution evidence; they do not claim a currently available staging backend.
No W01 fixtures or preserved legacy data were removed by pausing.
Overall W01 remains NOT ACCEPTED for the remaining gates already documented.

## Source recovery follow-up — 2026-10-26

A read-only Production migration-history inspection found nonempty stored SQL
for all 203 entries. The original booking foundation and two associated
hardening payloads were recovered privately and their lengths/MD5 verified.
The three-source recovery closes the source-location question; it does not
close historical replay. No recovered SQL was run or committed publicly.

An exact-name comparison against the current 218 repository files has 41
unmatched history names; aliases and combined migrations need content review
before treating them as missing schema. See the updated
[migration provenance](W01_MISSING_PRODUCTION_MIGRATION_PROVENANCE.md).

ai roadmap remains ACTIVE_HEALTHY and staging remains INACTIVE. W01 still needs
an available isolated runtime, a securely configured staging server key, and
the remaining replay/browser/expiry gates. No paid capacity was enabled.

## Verified before pause: cloud baseline, 1000 DB checks and 417 real HTTP checks passed — 2026-10-26

**Completed scoped verification; overall W01 still NOT ACCEPTED in full scope.**

The owner explicitly approved temporarily pausing `ai roadmap`
(`dqpdyschjpbdhhotmojs`). It is INACTIVE. The existing
`rythm-phase3-staging` (`viqjdgohtxqkrdgwtull`) was restored and is
ACTIVE_HEALTHY. Production/main are unchanged at
`8ba2f605f9fc926ab5428284f125589540a16ff0`.

### Baseline and isolation
The predecessor had 13 tables, two test-named organizations, 15 audit events,
and one reserved-test-domain Auth identity with no sessions. Twelve public
tables lacked RLS. The legacy schema and all its rows were preserved as
`w01_legacy_20261025`, with web-role schema access revoked. No existing account
was deleted. The authoritative private baseline was restored atomically;
all original catalog buckets matched BEFORE staging-specific restrictions.
Mixed CRLF/LF inside function bodies were preserved. A failed preflight attempt
had rolled back when Python newline normalization changed function hashes;
it was diagnosed and corrected without weakening comparison.

All 214 current public tables have RLS. The independently derived staging
expectation matches all ten catalog buckets after cleanup: 267 function
definitions unchanged; only the declared ACL/notification-trigger deltas differ.
Client TRUNCATE and unsafe new-public-table defaults are zero. Five application
functions that directly schedule jobs or send network requests are non-executable
by web/service/postgres application roles; `nail_2nya_push_new_booking` is disabled.
No OS/network sandbox or revocation of managed extension-owner permissions is
claimed. No cron jobs, queued outbound requests or Vault secrets exist.

The private cloud SQL checkpoint (SHA-256
`bc39b047ff4f302511ef594620e15e8f371d5b7e3f8e8afbdbb6ab4bbef9664f`)
and original inputs were saved privately for the owner. Cloud migration transport
referenced those checksummed private input bytes. That is a snapshot baseline
with an external private source dependency, NOT a repaired/self-contained replay
of the original historical migrations. The historical replay CI still FAILS.

### Actual authorization results
- Cloud DB-role matrix: **1000/1000 PASS**, 3 companies, 23 actors.
  Only the fixture preflight was adapted to allow the preserved legacy test
  identity; the 1000 authorization assertions were unchanged.
- Real GoTrue/PostgREST HTTP: **417/417 PASS**, all 23 identities logged in
  with passwords and normal `authenticated` JWTs. Covered own/foreign company,
  customer/project and explicit finance/contract boundaries, confidential budget
  columns/RPCs, positive owner CRUD, independent checks for silent foreign PATCH,
  malformed/tampered tokens, real refresh, logout and revoked refresh rejection.
- Setup was privileged SQL seeding of disposable Auth identities/password hashes,
  not signup/Admin API testing. HTTP assertions never used a service-role token.
- A correctly signed expired access JWT and a signed-in browser/SSR journey
  were NOT tested. Auth refresh/logout behavior must not be represented as proof
  that an unexpired access JWT is instantly invalidated.

### Preview
Pinned source `0e3de1cebf87b50924ec5c2b949d3d8f2911ac39`, deployment
`dpl_7uNdcj1Y65ALPpfbXtdBnpH9HybH`, READY:
https://rythm-company-feafa8vet-ytalashti-7156s-projects.vercel.app

A separate-project create was rejected by Vercel permissions; existing-project
branch-scoped env changes and deployment were authorized and succeeded instead.
Twenty-one overrides apply ONLY to Preview on the W01 branch. The known shared
provider settings are blanked, the URL/public key target staging, execution/
external-action/continuous-program/repair flags are false and AI budget is zero.
Production env records were not edited. Branch auto-deploy remains disabled.
Live `/api/qa/w01-boundary` returned HTTP 200 and every control true, including
no provider credentials and the expected staging ref. Landing/login form rendered
in the browser. This is **normal-user-auth-only**: the staging server/admin key
is intentionally blank, and privileged business workflows are not claimed tested.
Deployment Protection was retained. No Production alias was assigned.

### Cleanup and remaining gates
All new fixtures were removed from the newly restored public schema: zero
public rows/organizations, zero new W01 Auth users, zero sessions/jobs/Vault
secrets/outbound requests; `w01_test` absent. Cleanup used a guarded transaction
on the exclusive synthetic public dataset, without CASCADE into Auth/legacy.
The original 13 archived tables, two legacy test organizations, 15 archived audit
events and one original Auth test identity remain. Auth's own platform audit
history is not claimed purged. Private QA evidence is retained separately.

CI at the pinned source: application 40274678290 PASS; synthetic restore/
hardening 40274678365 PASS; core RLS 40274678289 PASS; offline baseline
40274678275 PASS; original historical replay 40274678266 FAIL.

Full W01 acceptance remains withheld for the known history/provenance limitation
and unverified privileged backend/complete browser/expiry scenarios. A separately
scoped staging server key must be configured through the owner's secure provider
settings before exercising privileged app flows; never paste it into chat or
substitute the Production key. No main merge or production remediation occurred.

The machine-readable [cloud verification evidence](W01_CLOUD_VERIFICATION_20261026.json)
is authoritative for current scoped statuses. Older sections below are historical.

## Historical: cloud activation blocked by active free-project quota

On 2026-10-25, continuing the owner's instruction to complete the isolated
environment, Work attempted to restore only the existing
`rythm-phase3-staging` project (`viqjdgohtxqkrdgwtull`).
Supabase rejected the request with ForbiddenException: the account has reached
the two-active-free-project limit. The active projects are Rythm-company-os and
ai roadmap. No active project was paused, deleted or upgraded; the failed restore
did not provide a working staging target. HTTP/JWT tests remain NOT RUN.
The owner must choose whether the unrelated ai roadmap project may be paused,
or approve a priced paid option. Do not pause Production or silently upgrade.
No cloud Auth test users or fixtures were created. Local DB matrix remains
1000/1000 PASS. No new HTTP harness is claimed implemented or executed.

## Historical: owner-local hardening committed and full matrix passed — 1000/1000

On 2026-10-25 the owner returned the controller output from their Windows
Docker target `supabase_db_w01-local-restore`. This is owner-supplied execution
evidence, not direct control of that computer by Work.

- `PASS_LOCAL_TRUNCATE_HARDENING`, `patch_committed=true`.
- Source dump SHA-256: `99178a9f3a21c1a88ab33cdf5a74526ffffd310ad39faecf454a971a7d6ffa64`.
- Patch SHA-256: `e5d48f1fce830a4f492a2a19bf92f220160ae8e19ec93baecee6333502133244`.
- Effective ACLs: 5,939 / `0d2aba5da97a004371fe116693dbf30c` to
  5,753 / `7fea1828e79dde41c9d99f0ad6bae922`.
- All other catalog buckets unchanged; backend/DML permissions preserved.
- Client TRUNCATE relations and future client TRUNCATE defaults: both zero.
- Unchanged tenant SQL SHA-256: `2612bea0b68d22b2f541d91bcb412d044771575bf028107986852f6c2b00da7f`.
- `PASS_DB_ROLE_SCOPE`: 3 companies, 23 actors, 1,000 checks,
  1,000 passed, zero failed.
- Cleanup reports zero cron jobs, Auth users, organizations, Vault secrets and
  outbound requests; helper schema absent.

This supersedes the 999/1000 baseline below. The first supplied hardening
download command omitted `w01-schema-inventory.sql`; that attempt stopped
before mutation. The pinned, checksummed inventory file was then supplied
and the owner returned the successful output above.

Read-only cloud metadata rechecked after this result:
`rythm-phase3-staging` (`viqjdgohtxqkrdgwtull`) is still INACTIVE.
Vercel has no branch-specific env entries for the W01 branch, while global
Supabase URL/publishable/service-role entries and several provider secrets
still target both Preview and Production. Values were not decrypted.
No isolated HTTP/JWT target or Preview runtime is verified.

**Database restore + local privilege hardening + full DB-role matrix are PASS
within their documented scopes. Overall W01 remains NOT ACCEPTED.**
HTTP/JWT validation, isolated Preview/runtime and historical replay/provenance
remain unresolved. No Production change or main merge was performed.

## Historical: full DB-role baseline executed — 999/1000 PASS

The owner returned a completed local matrix: 3 companies, 23 identities,
1,000 checks, 999 PASS and one failure: authenticated holds TRUNCATE on tenant
preferences. Cleanup independently confirmed zero organizations/users/jobs/
secrets/outbound requests and no test-helper schema. The matrix actually ran;
this is distinct from the earlier fixture-preparation failure.

The authoritative privilege export confirms 121 public relations (119 tables
and 2 views) grant TRUNCATE to authenticated and 65 tables to anon (186 grant
entries). View ACL bits are removed too, without asserting views can actually
be truncated. This is a database-role
boundary finding; no HTTP/PostgREST exploit is asserted. All 999 other matrix
outcomes passed, including tenant CRUD denial, sensitive-domain access,
manager/cross-reference restrictions, context RPC and escalation checks.

The reviewed candidate `scripts/qa/w01-revoke-client-truncate.sql` is deliberately
**local-QA-only**, requires an explicit transaction-local flag and is NOT a
Production migration. It removes client/PUBLIC TRUNCATE from public tables,
partitions, views/materialized views and public creator defaults; additive global defaults are revoked
only where they currently grant client TRUNCATE. Other schemas' existing objects
are untouched. It verifies all unrelated table privileges, including backend
TRUNCATE, remain exactly as before. It aborts on residual inherited client grants.

Changing defaults owned by supabase_admin requires that existing local admin
role; the normal postgres role cannot alter those defaults. The candidate uses
`psql -U supabase_admin -d postgres` over the disconnected container's local
Unix socket for that administrative transaction only. Its existing development
password is consumed only inside the local container via PGPASSWORD, never
printed, returned to the host or passed in process arguments. Catalog reads remain as
postgres, and matrix assertions remain authenticated/anon. No cloud password,
token, credential reset, network connection or new admin role is introduced.

The hardened expected catalog was computed through a **read-only filtered
catalog query** on Production, not by changing Production. All structural,
function, policy, owner, RLS, trigger/index/constraint and column-ACL buckets
remain identical. Only effective object grants change: 5,939 entries / MD5
0d2aba5da97a004371fe116693dbf30c -> 5,753 entries / MD5
7fea1828e79dde41c9d99f0ad6bae922. Default privileges have separate postconditions.

`w01-local-harden.mjs` accepts only the known local disconnected container,
the prior successful dump restore and the reviewed 999/1000 baseline finding.
It checks the patch/query/manifest hashes and the complete pre-change catalog,
then applies permissions and catalog assertions in ONE psql transaction. It
saves `w01-hardening-result.json` separately from the unchanged historical
baseline attestation, and reruns the **unchanged** 1,000-case matrix. A hardened
clone intentionally has different ACLs from unmodified Production; no claim of
unchanged privilege parity is made after this candidate is applied.

CI tests actual authenticated/anon TRUNCATE denial, proves the prior SQL-role
RLS bypass on synthetic rows then undoes it, checks data/backend/DML preservation,
future tables created by postgres/supabase_admin with global + per-schema defaults,
and idempotence. The full private-schema matrix still needs owner-local rerun.
Production remediation/promotion is a separate reviewed release; W01 never
applies this candidate to Production or merges main. HTTP auth/Preview are pending.

## Historical: authoritative local restore committed (owner-local evidence)

On 2026-10-25 the owner ran the controller on their Windows Docker machine and
returned `schema_parity=PASS_WITH_DOCUMENTED_SCOPE`, `network=disconnected`,
source SHA-256 `99178a9f3a21c1a88ab33cdf5a74526ffffd310ad39faecf454a971a7d6ffa64`.
The real initialized PostgreSQL target reports version 17.11. The controller
committed the single transaction only after matching every catalog bucket.
This is owner-provided execution evidence, not a claim that Work controlled
their computer. The original `rythm_w01_restore` template0 DB was not used.

Two bundle defects were corrected before this successful run: missing SQL
terminators between private function exports, and an unqualified public enum
type in GRANT signatures after pg_dump cleared search_path. Actual functions,
privileges and the original dump were preserved; no dummy types or dependencies
were introduced. Regression CI covers consecutive functions and enum GRANTs.

Next: `w01-tenant-matrix.sql` provisions Advertising A, Software Development B,
Retail C, 23 synthetic Auth identities (21 tenant personas + shared + outsider),
23 membership edges, independent finance/contract grants and known foreign IDs.
It asserts 1,000 expected DB-role access outcomes, including real-policy CRUD,
finance/contract boundaries, manager accountability, cross-tenant references,
context RPC authorization, privilege escalation and claim handling. All setup,
application triggers and test effects remain in one transaction and rollback.
The local runner verifies network disconnection, the prior successful restore,
the SQL checksum and post-run empty-fixture cleanup. It records failures without
silently treating missing schema or unexpected SQL errors as correct denial.

CI syntax-checks all PL/pgSQL bodies and exercises invoker-role assertion helpers
against real disposable PostgreSQL. **CI does not execute the full application
matrix without the private schema.** Owner-local execution is the next physical
action. DB claim simulation does not verify HTTP JWT signatures or expiry.
The TRUNCATE-privilege test is a database-role security check, not a claim that
PostgREST exposes SQL TRUNCATE through its HTTP API.

The first owner-local matrix attempt stopped during fixture setup: transport
status `disconnected` violated the real provider connection CHECK. No matrix
summary was produced. Independent cleanup returned zero organizations, Auth
users, cron jobs, Vault secrets and outbound requests, with no helper schema.
This was a fixture defect, not a completed failing authorization matrix.
The fixture now uses the valid `disabled` status and keeps both transport flags
false. CI executes this exact seed UPDATE against the actual table DDL extracted
from tracked migration `20260820203000_communication_center_mvp.sql`; it no
longer relies on syntax-only validation for that preparation step. Incomplete
SQL runs now report `INCOMPLETE_SQL_ERROR` separately from completed assertions.

The owner-supplied public-only dump was materialized privately, unchanged:
SHA-256 `99178a9f3a21c1a88ab33cdf5a74526ffffd310ad39faecf454a971a7d6ffa64`,
1,257,468 bytes; 214 tables, 234 functions, 338 policies, 141 triggers,
214 ENABLE RLS statements. It has **zero GRANT and CREATE EXTENSION statements**.
Text inventory is not proof of the absence of sensitive literals or executable
side effects. The original file and extracted production definitions are not
committed to this public repository or sent to public Actions logs/artifacts.

## Confirmed blocker fixed in the restore design

Public triggers and RPCs depend on **33 real functions in `crm_private`**.
Creating empty schemas cannot restore them. All 33 authoritative definitions and
the production effective schema/relation/function/type/column permissions were
retrieved via read-only catalog SELECTs into a private workspace. No business
rows, Vault values, credentials, Auth records or customer content were fetched.
Public/private functions are owned by postgres; public schema by pg_database_owner.
The public-only dump omits these private definitions, owners and privileges.

Real dependency extensions observed: btree_gist 1.7, pg_cron 1.6.4,
pg_net 0.20.4, pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0,
supabase_vault 0.3.1 and uuid-ossp 1.1. Auth, Storage, Realtime, GraphQL,
extension internals, default ACL/grantor lineage, provider settings and HTTP
authentication are separate scopes; no parity is claimed for them.

`w01-schema-inventory.sql` computes object-count/hash buckets for actual column
types/defaults, constraints (including FKs), indexes, enabled/disabled triggers,
function bodies/owners, relation RLS/force flags, policy expressions/roles,
selected extension versions and effective object/column privileges. The private
restore must match the independently captured `W01_RESTORE_EXPECTATIONS.json`.
It does not substitute counts for behavioral authorization tests.

## Executable safety boundaries

`w01-local-restore.mjs` uses only a local Unix socket/Windows named pipe Docker
daemon and containers named `supabase_db_w01-*`. Without `--restore` it only
reports local database metadata. Restore requires a checksummed private bundle.
It refuses a non-pristine public schema, pre-existing crm_private schema, any
Auth user, Storage object, Vault secret, cron job or pending network request.
It uses the initialized **postgres** DB with real Auth dependencies, rather than
the empty `rythm_w01_restore` created from template0. No existing database is
reset, dropped, cloned, or forcibly disconnected.

After preflight, the disposable database container's Docker networks are
disconnected and remain disconnected. SQL restoration uses psql `-X`,
`ON_ERROR_STOP=1` and `--single-transaction`; the empty public schema is dropped
with **RESTRICT**, never CASCADE. Dependencies, public DDL, exact effective
privileges and catalog assertions are in the same transaction. Any error rolls
back the schema transaction. A second invocation on a restored schema refuses
to overwrite it. The source SQL bytes are not rewritten. The local result
always leaves W01 NOT_ACCEPTED until tenant/HTTP/Preview gates separately pass.

The new isolated Actions workflow uses **synthetic DDL only**, real initialized
Supabase Auth, no cloud tokens and no production dump. It tests an intentional
restoration failure, actual transaction rollback, a corrected fixture restore,
network disconnection and refusal to reset an already-restored schema. A green
harness workflow **does not attest production-schema restoration**.

## Historical pre-cloud acceptance matrix

| Gate | Status | Evidence / remaining requirement |
| --- | --- | --- |
| Production/main baseline | PASS at inspection | Live READY production deployment still 8ba2f605f9fc926ab5428284f125589540a16ff0 |
| Real production schema inventory | PASS, catalog only | 214 tables, 267 public/private functions, 338 policies, 141 triggers, 631 indexes, 1,381 constraints; bucket hashes committed |
| Private authoritative restore inputs | PREPARED | Original public dump + real private functions + privilege catalog, private only |
| Actual complete schema restoration | PASS WITH DOCUMENTED SCOPE | Owner-local controller committed and matched all expected catalog buckets; Work did not control Windows |
| Three real application tenants and role matrix | PASS_DB_ROLE_SCOPE | Owner-local unchanged matrix: 3 companies, 23 actors, 1000/1000 passed; cleanup complete |
| Missing/invalid auth, HTTP JWT validation | NOT RUN | Database-role simulation cannot attest HTTP authentication |
| Vercel Preview safety | FAIL / CONTAINED FOR W01 | Shared targets still include preview+production; branch auto-deploy remains disabled |
| Restore controller safety | PASS in synthetic CI | Real Docker restore rollback, assertion helpers and TRUNCATE regression: Actions run 40221017170 |
| Full W01 signoff | NOT ACCEPTED | No merge, no staging/browser load against shared Preview keys |

Vercel env metadata was rechecked without decryption. Database URL/publishable
key/service-role key, OPENAI_API_KEY, GITHUB_APP_PRIVATE_KEY,
BROWSERBASE_API_KEY and other integration switches still include Preview and
Production targets. No values were read, rotated, copied or used for tests.
No cloud project was started/paused/deleted; no billed model, message or payment
was invoked. Production database access in this continuation was read-only.

## Historical previous next gate

Do not rerun the baseline restore or infer HTTP/JWT success from the DB matrix.
Prepare an isolated Auth/PostgREST runtime with outbound actions disabled, then
verify real normal-user JWTs, invalid/expired tokens and cross-tenant HTTP access.
Separately provision and attest an isolated Preview backend; the inactive cloud
candidate is not approved as clean or usable merely by its name. Any cloud
reactivation/provisioning must first resolve cost and data-isolation requirements.
Keep W01 auto-deploy disabled and do not test against shared Production targets.
