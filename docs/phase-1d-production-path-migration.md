# Phase 1D — Production Path Migration

## Canonical path and rollout

The following features enter through `executeAiRequest`, carry a real organization UUID and use feature-scoped `off` → `shadow` → `enforced` controls:

- `company.document_extraction`
- `boardroom.summary`
- `boardroom.legal_triage`
- `boardroom.legal_review`
- `boardroom.deliberation`

`off` and `shadow` retain the configured OpenAI compatibility model through the Gateway. `shadow` evaluates the adaptive proposal without a second provider request. `enforced` makes Request Intelligence v2 authoritative; it never falls back to a direct-provider call. A global or applicable feature kill switch forces `off`.

Production provider eligibility remains OpenAI-only. Provider/model choice in enforced mode comes from the configuration-driven model registry, not from these application modules.

## Failure behavior

- Invalid tenant, inactive entitlement, routing failure or no eligible model fails closed.
- Provider timeout, rate limit, provider error or malformed/empty output returns a classified Gateway error; application records are not accepted as successful.
- Required telemetry failure rejects governance-sensitive requests.
- Company document binary rejection fails rather than retrying without the source document.
- Boardroom and legal records retain their existing unique/idempotent persistence guards. The migration adds concurrent dedupe constraints for Company Library source paths and running legal reviews.

## Governance invariants

Boardroom remains multi-participant and role-specific, preserves disagreement, requires CEO-authorized participants and B-001 synthesis, and never closes the meeting or turns a recommendation into a decision. Legal triage still requires explicit Human CEO/Chair closure. A-106 remains advisory and cannot provide legal approval. Company document extraction is recorded as `derived_knowledge`, preserves source provenance and cannot create policy or decision authority.

## Approved temporary direct-provider exceptions

| Path | Provider | Reason and security boundary | Future migration target |
| --- | --- | --- | --- |
| `app/(app)/studio/agents/[id]/run/actions.ts` | OpenAI | Image generation and visual QA; server-only credentials, tenant context and no external business action. | Specialized multimodal Gateway after text-path stabilization. |
| `app/api/runtime/execute-validation/route.ts` | OpenAI | Dry-run validation; owner/tenant checks and external actions remain disabled. | Governed Execution Gateway phase. |
| `lib/evaluation/runtime.ts` | OpenAI | Fixed-model benchmark comparability; no tools or external execution. | Auditable fixed-model Gateway profile. |
| `lib/evaluation/promotion.ts` | OpenAI | Fixed-model promotion benchmark; tenant-scoped evidence and no automatic promotion. | Auditable fixed-model Gateway profile. |

No other direct-provider call path is approved.

## Database migration and rollback

`20260825113000_phase1d_feature_scoped_routing_rollout.sql` adds only feature rollout configuration and narrow unique indexes. RLS is enabled; authenticated users have tenant-safe read access, while writes remain service-role only.

Rollback: first set all five feature rows to `off`, deploy the prior application, then drop `meeting_legal_reviews_one_running_per_session`, `company_knowledge_org_storage_path_unique`, and `ai_routing_feature_rollout_config`. Without the feature table, the Phase 1D application fails routing rollout resolution safely to `off`.
