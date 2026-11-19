# W10 — Agency journey implementation and evidence
Updated 2026-11-19. **All three acceptance criteria PASS for the tested disposable staging scenario. Ready for human review; owner acceptance and production release are not implied.**

Branch: `pilot/w10-agency-e2e`. Draft PR [457](https://github.com/rythm2237/Rythm-company-os/pull/457).
Tested application source: `360323df0c1815e2fdbe41f28a8c1c0c0478d850`.
Subsequent CI-only commit `b61dbae52810d7eebd3679167509220eacb56441` disables paid replay and replaces the separate public-entry browser download with runner Chrome. Application code is unchanged.

## Baseline and connected resources
- Main rechecked on November 19: `55a1377e348c2d9ac0082c8b1f3acbba26acbc45` (W08). Production `rythm-os.com`: READY deployment `dpl_5u6eirwziYrg3pk5gFbY89M4mH3f`, same SHA. Historical audit SHA was not assumed current.
- Production Supabase `dezbacyuvsdrlpmmpjht`: ACTIVE_HEALTHY; last observed migration `20261107200646_w05_block_cached_private_downloads_production_20261107`. W03/W04/W05 hardening present; W10 migrations remain branch-only.
- Production health at `2026-11-19T07:23:23.092Z`: ok; database/OpenAI configured; agent execution enabled; external actions disabled/locked; timeout 90000 ms, retry 1. Full Vercel control-plane flag inventory returned 403 and remains unverified.
- Hosted staging `viqjdgohtxqkrdgwtull` is INACTIVE. Tests used disposable runner-local real Supabase Auth/PostgreSQL/Storage, not production or real customers.
- AI roadmap Supabase `dqpdyschjpbdhhotmojs` restored ACTIVE_HEALTHY. Vercel `ai-positions-roadmap` unpause succeeded; deployment `dpl_BQnHUR3oawEnAYjFPTqSTHGmycuF` READY; its public Vercel alias returned HTTP 200. Temporary capacity swap is restored.
- W03 and W08 remain release dependencies. Current main contains W08; passing regression CI includes their tenant/session boundaries.

## Implemented behavior
Agency provisioning, CRM, projects, meetings and approval systems already existed. The following defects prevented the complete journey; fixes use the existing architecture.

| Affected source (line references at tested source) | Change |
| --- | --- |
| `app/(app)/agents/[code]/page.tsx:18` | Persist enabled and agent_status together; retain entitlement/provisioning/archive guards. |
| `app/(app)/crm/actions.ts:40` | Log contract database error code only. |
| `app/(app)/projects/operating/page.tsx:29` and `app/api/projects/live/route.ts:28` | Owner specialist assignment UI; transactional capacity/history; explicit composite task/agent relationship removes ambiguous embeds; compact heading and expandable full objective. |
| `lib/meetings/synthesis-policy.ts:2`, meeting page/room/preparation/API | Accept Agency Strategy Director and legacy B-001; require enabled same-tenant explicitly authorized participants; resolve active Owner organization using W08 context. |
| `lib/ai/agent-provider.ts` | Omit unsupported GPT-4 reasoning parameters while preserving supported reasoning models and output/storage bounds. |
| `lib/projects/roadmap-task-graph.ts:10`, execution start and roadmap API | Validate task graph before approval writes. Bind exact current baseline-approval phrases to the actual existing gate; retain additional approvals and real task dependencies; reject missing, ambiguous, duplicate or cyclic references with reviewable HTTP 422. |
| `lib/projects/project-work-v2.ts:24` | Use persisted prior outputs, actual meeting state and scoped approved Human CEO receipt/response_note; reject foreign/pending/failed authorization lookup before provider access; require full inline content and atomic task/action completion. |
| `lib/projects/project-autonomous-meetings.ts:15` | Enforce Human CEO gates on new work, including when model says no approval needed; fail closed on required lifecycle/session/transcript/minutes/action/task/approval writes; store advisory recommendations without formal decision auto-approval. |
| `components/projects/project-task-results.tsx:8`, `lib/meetings/message-content.ts:2`, `app/(app)/meetings/room/DeliberationConsole.tsx:266` | Display persisted final document title/body and readable meeting advice. Preserve original records, legacy content, React escaping and advisory authority labels. |

Branch-only migrations, all under `supabase/migrations/` (entry point line 1):
- `20261117125000_assisted_activation_integration_department.sql`: narrow nested billing-admin provisioning exception for Integration Department/RYTHM-COMMS; external actions disabled.
- `20261117125500_agency_template_marketing_specializations.sql`: correct existing Agency specialist bindings.
- `20261117130000_crm_contract_customer_scope.sql`: evaluate explicit customer grant against proposed contract row.
- `20261117140000_project_workflow_read_grants.sql`: workflow reads under existing RLS and security-invoker timeline.
- `20261118120000_agency_meeting_synthesizer.sql`: align database session guard with Agency synthesis qualification.
- `20261118123000_project_meeting_completion_handoff.sql`: keep originating execution active until its correlated same-tenant meeting resolves; retain approval wait.
- `20261118133000_owner_project_specialist_assignment.sql`: SECURITY INVOKER Owner/member/entitlement/tenant/enabled-agent assignment RPC; allocation 1–100; capacity/history atomic; PUBLIC/anon denied.
- `20261118144000_internal_review_dispatch_continuation.sql`: continue already-authorized internal work through agent-only completion blockers; preserve explicit pause/HOLD/manual blockers, dependencies and approval waits; strengthen tenant joins.
- `20261118145000_leased_project_meeting_lifecycle.sql`: narrowly scoped service worker lifecycle using current same-tenant/project lease; Owner controls, required minutes/timestamps and closed immutability retained.
- `20261118150000_atomic_project_task_completion.sql`: service-only SECURITY INVOKER atomic task/output/action completion, valid lease and approved matching authorization required. Branch by service role before authenticated-only Owner helper; no broader Owner-helper grant.

Production catalog-only inspection confirmed authenticated meeting/session/participant write grants with RLS enabled; local replay reproduces them. No customer rows were accessed.

## Actual journey and records
[Full native run 44480348458](https://github.com/rythm2237/Rythm-company-os/actions/runs/44480348458) **SUCCESS**, both desktop 1440×900 and Pixel 7 emulation, real Chrome controlled by Playwright. Both evidence stages are `full_delivery_verified`.

The browser completed signup/local email confirmation → company reservation → pending entitlement surviving fresh login → synthetic authenticated billing-operator invoice confirmation through the existing RPC → active entitlement → Agency installation → persisted departments/specialists → CRM customer/brief → explicit customer-scoped contract permission → contract → accountable linked project → human task → specialist enable/pause/re-enable and team assignment → actual model analysis/roadmap → Owner approval and any additional task approvals → normal scheduler dispatch → persisted generated draft → completed native review meeting/transcript/minutes → pending Human CEO follow-up → Owner authorization with persisted direction → actual final document and linked completed action → refresh and new-context login.

No developer patched records into success. Synthetic assisted activation uses the normal billing role/RPC; scheduler uses its normal server authorization. Separate manual Boardroom UI creation/participants/refresh also passed; its additional model deliberation was not run.

| Profile | Tenant | Project | Actual final task output |
| --- | --- | --- | --- |
| Desktop | `250c64b6-43fa-47bc-8a37-000c7736ee10` | `a5870368-f9ef-4f31-a32b-2df0ee9c192a` | `a311dcd3-85d0-4967-8e7c-d36c3d2f8742` |
| Mobile | `a44c8565-db75-4fa0-94c9-b430b94f54b9` | `a062a426-3e71-491c-ad8d-c2acc3032fff` | `e9f0910e-dd4c-4ced-8bca-15d61a52c688` |

Both actual final bodies were independently read: 1000 synthetic impressions, 50 clicks, 10 purchases; CTR = 50/1000 × 100 = **5%**, click-to-purchase conversion = 10/50 × 100 = **20%**. They contain the final quantitative internal document, not a filename, future promise or another approval request. Screenshots confirm final document and saved meeting advice are readable on mobile. This is not evidence of a real campaign or real business outcome.

Real Owner/viewer/foreign Owner JWT checks passed: viewer can see permitted operational/customer records but cannot read/create restricted contracts or change Human CEO approval; anonymous/viewer/foreign team assignment denied; live project foreign access 404. Populated second-tenant controls deny cross-tenant reads/mutations across company roster, CRM, contracts, projects, actions, tasks, roadmaps, meetings, sessions, transcripts, approvals and readiness.

Record persistence was checked before disposable service destruction. These fixture IDs are evidence references, not currently hosted records. Always-run cleanup stopped Supabase with `--no-backup` and terminated app/proxy.

## Commands and evidence
[Public first-visit Agency entry run 44482022807](https://github.com/rythm2237/Rythm-company-os/actions/runs/44482022807) **SUCCESS** on the CI-only follow-up commit: desktop and Pixel 7 template selection survives signup navigation and reload. Chrome uses the runner-installed channel; no browser download or provider call. Follow-up [general CI 44482022865](https://github.com/rythm2237/Rythm-company-os/actions/runs/44482022865) also **SUCCESS**.

[General CI 44480348456](https://github.com/rythm2237/Rythm-company-os/actions/runs/44480348456) **SUCCESS** for both build and crm-browser. Exact executed command/status inventory is committed in [validation manifest](evidence/w10-2026-11-19-validation.json). This includes `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build`, W03/W05/W06/W08, logout, CRM browser/unit, commercial payment/funnel, Boardroom, phases 0–5, routing, integrations and software-company regressions. Existing lint warnings remain; no passing-check errors. No package/lock changes.

Full native run executed these focused commands successfully:
```sh
node --check scripts/validate-w10-agency-reservation.mjs
node --check scripts/w10-budget-proxy.mjs
node --import tsx scripts/validate-w10-meeting-synthesis.ts
node --import tsx scripts/validate-w10-project-results.tsx
node --import tsx scripts/validate-w10-meeting-content.ts
node --import tsx scripts/validate-w10-provider-compatibility.ts
node --import tsx scripts/validate-w10-meeting-handoff.ts
node --import tsx scripts/validate-w10-meeting-lifecycle.ts
node --import tsx scripts/validate-w10-internal-dispatch.ts
node --import tsx scripts/validate-w10-task-completion.ts
node --import tsx scripts/validate-w10-roadmap-graph.ts
node scripts/validate-w10-roadmap-boundary.mjs
node scripts/validate-w10-task-approval-context.mjs
node --import tsx scripts/validate-w10-team-assignment.ts
node scripts/validate-w10-meeting-approval-boundary.mjs
node scripts/validate-w10-agency-reservation.mjs
```
Database checks execute actual PostgreSQL with authenticated/service roles, including forced-write rollback, foreign/expired/unapproved denial, service-only ACL and immutable final states. Compiled actual API/worker adapter tests check failure branches without provider usage. Installed-schema regression additionally exercises leased meeting lifecycle and atomic task/action completion under real service role before the browser journey.

[Raw synthetic journey records and full outputs](evidence/w10-2026-11-19-full-journey.json) and [timestamped passing assertions](evidence/w10-2026-11-19-assertions.log) are retained in git.
[Artifact 14508357674](https://github.com/rythm2237/Rythm-company-os/actions/runs/44480348458/artifacts/14508357674) contains original desktop/mobile screenshots, evidence and budget; expires 2027-02-17. Downloaded ZIP independently hashed SHA-256:
`f48f7c54e305d5785e2282e1179c0482951fb7aa6f34ad01d70ae0e60724f010`.

Final run: 22 actual provider HTTP 200 responses, usage estimate **$0.0508452**; cumulative recorded W10 estimate **$0.247436**, below authorized $1. Estimates are token accounting, not invoices; one earlier rejected-request uncertainty had reservation upper bound $0.014958, still safely below the ceiling. Fixed provider/model, bounded loopback proxy, no external tools/streaming/actions; keys server-only, absent from repo/browser/evidence. Paid CI is now explicitly disabled; stored secret remains intact.

## Acceptance and limits
| Mandatory criterion | Result and evidence |
| --- | --- |
| Full Agency path completes without developer intervention | **PASS** in disposable staging: normal authenticated UI/roles, actual worker/model/meeting, Owner approvals and final documents on both profiles. |
| Every persisted record survives refresh and belongs to the right tenant | **PASS** for all journey record types: persisted row assertions, refresh/fresh login, correct tenant relationships and populated foreign-tenant negative controls. |
| No critical navigation, state or permissions defects | **PASS** within the tested journey: desktop/mobile replay, role denials, approval waits and atomic failure regressions. Not a universal absence-of-defects claim. |

The disposable database is a documented **scoped reconstruction**, not an exact hosted snapshot. Temporary replay renumbers legacy suffixed migrations/preflight ordering, supplies a synthetic historical seed identity, excludes live-tenant workforce transfer/unrelated 2nya/absent hosted-only function references/Storage ownership-only comment, marks the incomplete Web Development overlay preview, and reproduces Data API grants under asserted RLS. Exact hosted schema parity, full control-plane flag inventory and physical-device testing remain unverified. Existing dependency advisories are outside this targeted change.

No W10 merge, production migration/deployment, real external message, charge or customer-data mutation occurred. Passing branch evidence does not authorize release.

## Rollback and human sign-off
Rollback before release: close the unmerged draft PR/discard feature branch. Disposable fixtures are already destroyed; production needs no W10 rollback. If separately released later, assess dependent data before any reverse migration; do not blindly delete records.

- [ ] Review actual final documents, KPI calculations, original screenshots and record IDs.
- [ ] Review all migration/RPC/trigger and tenant/entitlement/approval constraints.
- [ ] Confirm hosted schema/flags parity and W03/W08 release dependencies.
- [ ] Explicitly accept W10 evidence.
- [ ] Separately approve any merge, production migration or deployment.
