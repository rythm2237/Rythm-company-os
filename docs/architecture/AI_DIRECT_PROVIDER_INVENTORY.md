# Direct AI provider call inventory

This inventory is enforced by `scripts/validate-ai-gateway-phase1a.ts`. A new direct provider import or endpoint outside the listed files fails CI.

| Path | Classification | Current security boundary | Intended path |
| --- | --- | --- | --- |
| `lib/ai/agent-provider.ts` | Provider adapter boundary | Server-side credentials; existing RYTHM routing wrapper | Split into provider-specific transports later without changing the Gateway contract |
| `app/api/meetings/deliberate/route.ts` | Migrate in Phase 1 | Owner organization context, CEO-authorized participants, internal-only execution | Canonical Gateway in Phase 1D |
| `app/api/meetings/summarize/route.ts` | Migrate in Phase 1 | Owner organization and meeting/session scope | Canonical Gateway in Phase 1D |
| `app/api/meetings/legal-triage/route.ts` | Migrate in Phase 1 | Owner organization context, closed-meeting basis, advisory output | Canonical Gateway in Phase 1D |
| `app/api/meetings/legal-review/route.ts` | Migrate in Phase 1 | Owner organization context, advisory-only structured output | Canonical Gateway in Phase 1D |
| `lib/company-library-ingestion.ts` | Migrate in Phase 1 | Invoked from tenant-scoped server paths; document instructions treated as untrusted | Specialized extraction profile in Phase 1D |
| `app/(app)/studio/agents/[id]/run/actions.ts` | Approved temporary exception: image generation | Canonical owner organization lookup; no external business action authority | Specialized multimodal Gateway profile after text migration stabilizes |
| `app/api/runtime/execute-validation/route.ts` | Approved temporary exception: execution validation | Authenticated owner, organization-scoped run, dry-run only, external actions must be disabled | Future Execution Gateway phase |
| `lib/evaluation/runtime.ts` | Approved temporary exception: evaluation | Server-only, organization-scoped benchmark, external execution prohibited | Auditable fixed-model Gateway profile |
| `lib/evaluation/promotion.ts` | Approved temporary exception: evaluation | Server-only, organization-scoped evidence; promotion is not automatic | Auditable fixed-model Gateway profile |

No Vercel AI Gateway, additional provider, deprecated provider or unidentified direct-provider call exists in the inspected application source.

## Frozen legacy wrapper callers

The CI safeguard also freezes existing calls to `runAgent`, `generateSystemInstruction` and the adapter registry. New feature code must call `executeAiRequest` instead. Existing wrapper callers are limited to:

- Agent Console;
- Agent Studio instruction generation;
- Master Agent instruction generation;
- trusted Agent knowledge acquisition;
- trusted specialization acquisition;
- the canonical Gateway and its adapter implementation.

These legacy callers remain compatible in Phase 1A and are migrated only through the later gated Phase 1 releases.
