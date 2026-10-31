# W02 — isolated three-company acceptance fixtures (P0, dependent on W01)

## Verified baseline (2026-10-25)

- GitHub `main`: `8ba2f605f9fc926ab5428284f125589540a16ff0`, identical to Vercel's most recent production deployment SHA. Later preview deployments on `feat/universal-project-intelligence` are **not** production.
- Production Supabase project ref: `dezbacyuvsdrlpmmpjht`. The only allowlisted W02 staging project is `viqjdgohtxqkrdgwtull` (`rythm-phase3-staging`); it was **INACTIVE** during inspection and migration introspection timed out.
- Repository `README.md`, `app/(auth)/setup/company/actions.ts`, `lib/auth/organization-context.ts`, `scripts/validate-phase2-rls.ts`, `docs/commercial/DAY2_MULTITENANT_ACCEPTANCE.md`, and the CRM migrations/tests were read. No `AGENTS.md` was found in the repository tree.
- Production database metadata was inspected read-only. The actual `organization_members.role` constraint accepts **only** `owner`, `executive`, `operator`, `auditor`, `viewer`. **`admin` and `project_manager` are personas, not DB membership roles.** W02 maps admin to executive (not an owner/privileged admin), and project manager to operator plus `projects.primary_manager_user_id`; there is **exactly one** project manager per synthetic project. Member, finance-restricted and finance-authorized are operators with differing `crm_access_grants`.
- Source-defined templates: Company A/B `ready_ai_advertising_agency_v1`, Company C `ready_software_company_v1`. All entitlements stay `pending`, with `base_price=0`, `ai_budget_limit=0`, and builder/execution flags disabled. These are never paid-customer fixtures.

## Delivered on the dedicated feature branch

- `scripts/fixtures/w02-blueprint.mjs` — three stable UUIDs for organizations, three stable project UUIDs, 19 synthetic identities, 20 membership edges, three explicit finance-read grants, 37 forbidden actor/tenant pairs; deterministic across runs.
- `scripts/fixtures/w02-staging.mjs` — staging-only idempotent setup, authenticated permission/RLS assertions and forbidden organization-switch attempts, verified cleanup. `roundtrip` always calls teardown in a `finally` block. The evidence manifest is `.w02-fixtures/viqjdgohtxqkrdgwtull.json` (ignored by Git) and contains real staging actor UUIDs, cross-tenant IDs and expected permission matrix, **no credentials**.
- `scripts/validate-w02-fixtures.mjs` — **offline, no-service** contract and repeatability tests (twice); checks 57 actor/tenant combinations and 37 negative pairs, all three finance boundaries, unique UUIDs, removal from an in-memory lifecycle model, and source-level staging safety gates. Offline green **cannot** count as staging DB/RLS/teardown green.
- `npm run test:w02`, build precheck and separate pull-request CI workflow.

## Run only after W01 review and a staging-only credential setup

Do not create a new Supabase project, restore an inactive project if that incurs unapproved cost, or point this fixture runner at production. A reviewer must first verify the **actual staging database migration level and credentials**. Never paste service-role keys, passwords or tokens into commits, PRs, logs or ChatGPT messages.

Populate the following **process environment** from the secured staging secret store (do not commit an env file):

| Variable | Expected value |
| --- | --- |
| `W02_STAGING_REF` | `viqjdgohtxqkrdgwtull` |
| `W02_STAGING_SUPABASE_URL` | `https://viqjdgohtxqkrdgwtull.supabase.co` |
| `W02_STAGING_SERVICE_ROLE_KEY` | Staging-only secret (server process, never browser) |
| `W02_STAGING_ANON_KEY` | Publishable/anon credential from **staging** |
| `W02_TEST_PASSWORD` | Strong password for synthetic test users, 16+ characters, kept out of logs |
| `W02_W01_VERIFIED` | `true` only after dependency W01 has been independently signed off |

Run commands in the repo checkout:

```bash
npm ci
npm run test:w02
node scripts/fixtures/w02-staging.mjs roundtrip
# For debugging a failed live run, after reviewing staging objects:
node scripts/fixtures/w02-staging.mjs teardown
npm run typecheck
npm run lint
npm run build
```

`roundtrip` signs in as each synthetic test identity using the staging anon client, tests finance scope via the real `crm_can` RPC, reads scoped tenant records, denies forged switches, and switches legitimate shared membership A/B. The service-role client is restricted to provisioning, evidence inspection and deletion; it must **never** be used for RLS access assertions. Tests must fail closed rather than treat missing rows or missing schema as success.

## Actual-role permission matrix

| Persona | Membership | Project manager | Finance read | Scope |
| --- | --- | --- | --- | --- |
| Owner | `owner` | No | Denied unless separately granted | Own company |
| Admin (executive persona only) | `executive` | No | Denied | Own company |
| Project manager | `operator` | Yes, own synthetic project | Denied | Own company |
| Member | `operator` | No | Denied | Own company |
| Finance restricted | `operator` | No | Denied | Own company |
| Finance authorized | `operator` | No | Allowed only through `finance.read` company-scoped grant | Own company |
| Shared user | `operator` in A and B | No | Denied | A and B only; C forbidden |

All other combinations are negative cases. No owner privilege, executive title, or project-manager relationship implicitly authorizes contract or finance disclosure. A separate, fully privileged admin product capability is **not implemented by these fixtures**.

## Acceptance / security gate status before live staging

- AC1 — synthetic tenants and roles **code-defined**; staging provisioning **BLOCKED / NOT TESTED**.
- AC2 — deterministic forbidden UUID/role matrix **code-defined**; staging evidence and authenticated RLS **BLOCKED / NOT TESTED**.
- AC3 — cleanup implementation and simulated repeatability **code-defined**; live teardown **BLOCKED / NOT TESTED**. Production has never been targeted by the runner, but zero production fixture rows must be independently confirmed via a read-only synthetic-slug count after the staging roundtrip.
- Immutable audit events generated by context switches can remain as **audit-only historical evidence** after deleting synthetic customers/projects/users. Do not delete or rewrite append-only audit history; do not confuse business-fixture removal with audit-log erasure.

Human sign-off checklist: W01 passed; staging is active/isolated and migration-compatible; service credentials are staging scoped; all 19 test logins pass; 20 memberships and 3 manager FKs checked; every forbidden UUID returns zero; each foreign context switch denied; finance read only for three explicit grantees; Company C isolated from shared user; repeated setup/teardown confirmed; production synthetic-prefix count unchanged; no real third-party/customer data accessed; branch CI/typecheck/lint/build green; reviewer authorizes any later merge separately.

## Rollback

No production migration, deployment or release accompanies W02. Roll back repository changes by closing the draft PR or deleting the `test/w02-isolated-multitenant-fixtures` branch. If a staging run was performed, execute `node scripts/fixtures/w02-staging.mjs teardown` with the same staging-only variables and verify all fixture company UUIDs are absent; manually inspect failures before attempting further cleanup. Never use this procedure against production.


## 2026-10-30 — Real staging evidence and immutable-audit teardown blocker

- Successful authenticated RLS/finance/forged-switch verification: GitHub Actions run [41034885117](https://github.com/rythm2237/Rythm-company-os/actions/runs/41034885117). This verifies 3 organizations, 19 identities, 20 memberships, 37 forbidden user/tenant pairs; it **does not** verify teardown.
- Real staging shows synthetic `project_manager_history` and `crm_audit_log` records referencing synthetic companies/projects. PostgreSQL foreign keys prohibit deletion of parent projects/companies while those immutable audit references exist.
- Previous teardown failed on `project_manager_history_organization_id_project_id_fkey`; a partial disposable fixture remains. Repeating its original destructive cleanup is unsafe.
- New `audit-check` command and `teardown` precondition fail closed **before any deletions** if historical references exist. Never delete or rewrite audit/history, disable triggers, relax FK constraints, or use production to achieve a green test.
- **Acceptance status:** AC1 (setup/roles): PASS; AC2 (authenticated RLS and financial boundaries): PASS; AC3 (removable, repeatable fixtures): **NOT ACCEPTED**. Offline model repeatability is not live teardown evidence.

### Architecture decision needed for AC3

Audit-preserving cleanup cannot mean physically deleting all synthetic rows while retaining immutable audit rows with mandatory foreign keys to those rows. A safe solution must be explicit and verified against the deployed schema. Recommended option: archival/quarantine of synthetic operational records, revocation of active finance grants and memberships, disabling of fixture sign-ins, and read-only evidence that zero synthetic identities have active access. Retain historical parent IDs as required by audit FKs. Repeatability must use an unambiguous fresh fixture generation or safe reactivation with audited state transitions and must prove **zero active synthetic access**, not falsely assert zero historical rows. If strict physical deletion remains a mandatory acceptance criterion, use a **new isolated disposable database** with an approved evidence export/retention policy; do not erase immutable audit records in this staging database.

**Until AC3 is agreed and implemented, do not run the old destructive `roundtrip` path or mark W02 complete.** Production and `main` application code remain outside this remediation.


## 2026-10-31 — Live W02 acceptance evidence

- GitHub Actions [run #41221322661](https://github.com/rythm2237/Rythm-company-os/actions/runs/41221322661) completed **SUCCESS** on branch `test/w02-isolated-multitenant-fixtures`.
- Real staging authentication/RLS verification: **PASS** for three synthetic companies, 19 users, 20 memberships and role/finance/forged-switch checks.
- Audit-preserving quarantine: **PASS**. The three synthetic projects transitioned to schema-valid terminal `cancelled` state. All fixture memberships were deactivated, finance grants revoked and all 19 fixture Auth users banned. Historical project-manager and CRM audit references retained.
- A separate `verify-quarantine` step rechecked zero active synthetic memberships/finance grants and all 19 fixture identities banned: **PASS**.
- **AC3 under the revised audit-preserving zero-active-access policy is PASS.** This is NOT physical deletion and does NOT establish two complete live setup/verification/quarantine cycles on fresh identities. Historical fixture rows persist intentionally. A fresh-identity or disposable-database repeatability test remains a separate follow-on hardening test, not a claim made by this result.
- All code changes remain on the feature branch. Only the manual GitHub Actions dispatch YAML was added to main earlier. No application or production database migration was deployed as part of this acceptance run.
