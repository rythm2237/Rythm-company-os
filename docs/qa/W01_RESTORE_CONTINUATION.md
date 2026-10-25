# W01 private schema restore continuation — 2026-10-25

**W01 NOT ACCEPTED. No merge or production mutation is authorized.**

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
| Actual complete schema restoration | BLOCKED | This Work terminal has no Docker binary/socket/PostgreSQL and no access to the owner's Windows PowerShell |
| Three real application tenants and role matrix | NOT RUN | Must run against the complete, parity-verified restore; historical two-tenant core smoke is insufficient |
| Missing/invalid auth, HTTP JWT validation | NOT RUN | Database-role simulation cannot attest HTTP authentication |
| Vercel Preview safety | FAIL / CONTAINED FOR W01 | Shared targets still include preview+production; branch auto-deploy remains disabled |
| Restore controller safety | LOCAL UNIT PASS / CI PENDING | Remote-target, bundle-tamper and dependency-inventory tests; real Docker CI separately required |
| Full W01 signoff | NOT ACCEPTED | No merge, no staging/browser load against shared Preview keys |

Vercel env metadata was rechecked without decryption. Database URL/publishable
key/service-role key, OPENAI_API_KEY, GITHUB_APP_PRIVATE_KEY,
BROWSERBASE_API_KEY and other integration switches still include Preview and
Production targets. No values were read, rotated, copied or used for tests.
No cloud project was started/paused/deleted; no billed model, message or payment
was invoked. Production database access in this continuation was read-only.

## Single next owner action

Run the supplied private bundle controller on the Windows machine that owns
the already-running `supabase_db_w01-local-restore` container. It validates the
actual machine state and attempts the atomic isolated restore only if pristine.
Return only `w01-local-result.json` or the controller's short refusal/error.
Do not upload the bundle, SQL, permissions catalog, logs containing SQL, Docker
inspection environment, passwords or connection strings to this public PR.

If preflight refuses a non-pristine database, no reset is allowed: retain its
error and provision a new W01-only initialized database in the next continuation.
