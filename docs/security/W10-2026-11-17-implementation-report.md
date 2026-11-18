# W10 Agency journey implementation evidence

Updated 2026-11-18. **OPEN: full delivery acceptance has not passed.** This report distinguishes passing slices from the complete journey. Draft PR [457](https://github.com/rythm2237/Rythm-company-os/pull/457), branch `pilot/w10-agency-e2e`. No merge or production deployment is authorized by this report.

## Resolved baseline and environment

- Main: `55a1377e348c2d9ac0082c8b1f3acbba26acbc45` (W08). Production alias `rythm-os.com`: READY deployment `dpl_5u6eirwziYrg3pk5gFbY89M4mH3f`, same SHA. Historical audit SHA was not assumed current.
- Production health read at `2026-11-18T20:48:34.882Z`: healthy; agent execution enabled; external actions disabled; OpenAI configured; timeout 90000 ms, one retry. No secret values returned in evidence.
- Supabase production `dezbacyuvsdrlpmmpjht`: ACTIVE_HEALTHY. Migration inventory previously read through `20261107200646`; deployed W03/W04/W05 hardening present. W10 migrations below are branch-only.
- AI roadmap project `dqpdyschjpbdhhotmojs` ACTIVE_HEALTHY; hosted staging `viqjdgohtxqkrdgwtull` INACTIVE. Temporary capacity swap was restored. Current tests use disposable runner-local services and make no hosted changes.
- Vercel flag inventory returned 403. Effective runtime flags were observed through production health; complete control-plane flag inventory remains unverified.
- W03 and W08 are release dependencies. Main contains W08; current regression CI covers their auth, session and tenant boundaries. This does not authorize production changes.

## Implemented corrections

| Source | Correction |
| --- | --- |
| `supabase/migrations/20261117125000_assisted_activation_integration_department.sql` | Narrow nested-trigger allowance for authenticated platform-billing-admin activation provisioning of Integration Department and disabled-external-action RYTHM-COMMS. Other writes retain tenant membership checks. |
| `supabase/migrations/20261117125500_agency_template_marketing_specializations.sql` | Bind existing marketing specializations needed by newly installed Agency specialists. |
| `supabase/migrations/20261117130000_crm_contract_customer_scope.sql` | Evaluate explicit customer contract grant against the proposed inserted/read row. |
| `supabase/migrations/20261117140000_project_workflow_read_grants.sql` | Existing RLS-protected workflow reads and security-invoker timeline grants. |
| `app/(app)/agents/[code]/page.tsx:18` | Owner runtime toggle persists both enabled and agent_status atomically; preserves provisioning/entitlement/archive guards. |
| `lib/meetings/synthesis-policy.ts:2`, meeting wizard/preparation, meeting page/room/API | Agency Strategy Director can synthesize alongside legacy B-001. Manual sessions retain two enabled tenant-local explicitly CEO-authorized participants; W08 active organization resolution replaces single-membership assumption. |
| `supabase/migrations/20261118120000_agency_meeting_synthesizer.sql` | Align PostgreSQL session guard with the same Agency/legacy synthesis qualification. |
| `lib/ai/agent-provider.ts` | GPT-4-family requests omit unsupported reasoning parameters; actual SDK payload regression preserves supported reasoning models and output/storage limits. |
| `components/projects/project-task-results.tsx`, `app/(app)/projects/operating/page.tsx:282` | Safely render actual persisted task summaries and structured deliverables; label agent output as advisory, not evidence of external implementation. |
| `supabase/migrations/20261118123000_project_meeting_completion_handoff.sql` | Hold originating execution while its same-tenant requested meeting is unresolved; preserve post-meeting approval gate and idempotent terminal work reconciliation. |
| `supabase/migrations/20261118133000_owner_project_specialist_assignment.sql`, operating page `:29`, `:267` | Normal Owner UI and transactional SECURITY INVOKER RPC assign existing enabled tenant specialists, capacity and history. Reject viewer/anonymous/foreign/paused/out-of-entitlement assignments. Preserve RLS. |
| `app/api/projects/live/route.ts:28`, operating page `:141` | Explicit W03 composite task-to-agent relation avoids ambiguous PostgREST embeds; scoped safe read-error diagnostics. |
| Operating page header/objective | Compact project heading and expandable full objective preserve the complete persisted brief without oversized header. |
| `lib/projects/project-autonomous-meetings.ts:15` | New meeting work under approval_required always awaits Human CEO approval, even if model says otherwise. Normalize risk; fail closed on required approval/action/task persistence failures. |
| `app/(app)/crm/actions.ts:40` | Contract save diagnostic logs database error code only. |

## Real browser evidence and known failures

- [44147533206](https://github.com/rythm2237/Rythm-company-os/actions/runs/44147533206), `5783128d30fa94ed4834108199f567ee5a9ce2cd`: **PASS partial desktop + Pixel 7**. Actual signup/local confirmation email, Agency reservation, fresh Owner login, pending entitlement, synthetic authenticated billing operator confirming an invoice through existing RPC, template installation, CRM customer/brief, explicit customer-scoped grant UI, contract, linked project with primary manager, action creation/in_progress/reload, fresh login, foreign Owner read/mutation denial, same-tenant viewer customer visibility and contract read/create denial. No real invoice, charge, email delivery or external customer data.
- [44394501686](https://github.com/rythm2237/Rythm-company-os/actions/runs/44394501686), `e3404cc216d987f87e375921853af7103078026c`: **FAIL full delivery**. Real departments/specialists, enable/pause/re-enable, Owner team assignments/capacity and authenticated live project API passed. Actual model analysis, roadmap and approved initial task persisted. Review meeting did not complete. Three provider HTTP 200 responses; usage estimate $0.0070172. Full acceptance is not inferred from these successes.
- [44394612601](https://github.com/rythm2237/Rythm-company-os/actions/runs/44394612601), `60c85f5065231e2acc7caa9067a15857c3c48477`: **FAIL manual meeting browser**. Core/team/live API passed; manual lead activation was followed by premature navigation, so Strategy Director was absent from wizard. Added explicit wait for persisted runtime state before navigation. This run had no provider access. Artifact SHA256 `3b54c758376d50129adb553e7b781bb028d99f82576b2780d66c71602e013bf4`; failure screenshot inspected.
- [44395391542](https://github.com/rythm2237/Rythm-company-os/actions/runs/44395391542), `c872f8a19da37ea868fbed89f64074a8ef47b49a`: **FAIL roadmap approval/start** after two real provider responses; generic HTTP failure requires persisted diagnostics. Usage estimate $0.0046524. Artifact SHA256 `965ffc543438a9dc5e579321e85a3aa2c15b8c6bd64644281741298058aa39b0`.
- [44395391387](https://github.com/rythm2237/Rythm-company-os/actions/runs/44395391387), same application source: **PASS full CI**. Build/typecheck/lint, W03 worker/document/memory/reference/OAuth/egress/relationships, W05/W06, W08 redirect/session/browser/logout, CRM browser/unit, commercial payment/funnel, boardroom, phase0–5, routing, integrations and software-company checks passed. CI success is separate from the failing W10 delivery test.

Browser tests use Playwright with real Chrome, real local Supabase Auth/PostgreSQL/Storage and synthetic identities. Assertions read persisted rows under Owner/viewer/foreign Owner clients; service access is confined to isolated fixture verification and synthetic assisted activation. Scheduler runs through its normal server-authorized route. Tests never mutate task/meeting results into success. Evidence JSON includes synthetic record IDs and actual model output; failure screenshots and JSON are uploaded for 90 days.

The disposable schema is a **scoped reconstruction**, not an exact hosted snapshot. The workflow documents legacy migration renumbering/preflight ordering, a synthetic seed identity, omission of historical live-tenant workforce transfer/unrelated 2nya migrations/absent hosted-only function references/Storage owner-only policy comment, Web Development preview overlay and explicit local Data API grants under existing RLS. Exact hosted schema parity remains a release review item.

## Commands and safety bounds

Executed locally: `npm run typecheck` PASS; `git diff --check` PASS; `node --check scripts/validate-w10-agency-reservation.mjs` PASS; `node --check scripts/w10-budget-proxy.mjs` PASS; `node --import tsx scripts/validate-w10-meeting-synthesis.ts` PASS; `node --import tsx scripts/validate-w10-project-results.tsx` PASS; `node --import tsx scripts/validate-w10-provider-compatibility.ts` PASS; `node --import tsx scripts/validate-w10-meeting-handoff.ts` PASS; `node --import tsx scripts/validate-w10-team-assignment.ts` PASS; `node scripts/validate-w10-meeting-approval-boundary.mjs` PASS. Targeted ESLint passed after renaming a reserved test variable. CI run above supplies exact complete executed command list/results including production build. Existing lint warnings remain; no errors in passing CI.

Model calls use a server-only loopback proxy, fixed model/provider, bounded output/request size, no tools/streaming/external actions, up-front token reservation, $0.25 per live runner ceiling. Live mode is armed for a single predecessor SHA; routine documentation/free-test commits cannot automatically spend. Authorized cumulative budget is $1. Usage totals are estimates from token accounting, not a billing receipt. Earlier recorded successful runs used $0.0075252, plus $0.0070172 and $0.0046524 above: $0.0191948 before subsequent live runs. Keys never enter repository/browser/report/artifacts.

## Acceptance and release review

| Acceptance criterion | Status |
| --- | --- |
| Full Agency path completes without developer intervention | **FAIL / OPEN**: meeting → Human CEO approval → final artifact not yet passed end to end. |
| Every persisted record survives refresh and belongs to right tenant | **FAIL / incomplete**: core Agency/CRM/project/action/team slice passed; complete meeting/approval/output slice still pending. |
| No critical navigation, state or permissions defects | **FAIL / OPEN**: complete browser replay must pass after remaining fixes. |

Rollback: close the unmerged draft PR or discard the feature branch. Each CI stack is stopped with `supabase stop --no-backup` in always-run cleanup. No W10 production migration/deployment/customer mutation exists to roll back. If later released, evaluate dependent data before reverting migrations; do not blindly drop workflow records.

Human sign-off checklist:

- [ ] Review trigger exception, contract grants and Owner assignment RPC; confirm active membership, entitlement and tenant boundaries.
- [ ] Inspect full desktop/mobile screenshots, record IDs, actual output and Human CEO decisions from a passing live run.
- [ ] Check KPI arithmetic and clear distinction between synthetic internal deliverable and real marketing outcome.
- [ ] Resolve exact hosted staging schema/flag parity and verify W03/W08 release dependencies.
- [ ] Separately approve any merge, production migration or deployment. A passing branch does not imply deployment or owner acceptance.
