# W01 private schema restore continuation — 2026-10-25

**W01 NOT ACCEPTED. No merge or production mutation is authorized.**

## Latest: owner-local hardening committed and full matrix passed — 1000/1000

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

## Latest: authoritative local restore committed (owner-local evidence)

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

## Current acceptance matrix

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

## Next gate

Do not rerun the baseline restore or infer HTTP/JWT success from the DB matrix.
Prepare an isolated Auth/PostgREST runtime with outbound actions disabled, then
verify real normal-user JWTs, invalid/expired tokens and cross-tenant HTTP access.
Separately provision and attest an isolated Preview backend; the inactive cloud
candidate is not approved as clean or usable merely by its name. Any cloud
reactivation/provisioning must first resolve cost and data-isolation requirements.
Keep W01 auto-deploy disabled and do not test against shared Production targets.
