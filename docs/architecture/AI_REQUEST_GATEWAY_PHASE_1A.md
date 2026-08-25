# RYTHM AI Request Gateway — Phase 1A

## Boundary

`executeAiRequest` in `lib/ai/request-gateway.ts` is the canonical entry point for new AI capabilities. RYTHM owns request intelligence, routing, provider eligibility, policy context, correlation, error normalization and later telemetry. Provider transports do not own company policy and cannot grant permissions or authority.

Phase 1A introduces this boundary without migrating existing production callers. Existing behavior therefore remains authoritative until the later, independently gated migration phases.

## Request flow

1. A caller supplies authenticated organization and actor context.
2. The Gateway validates the request envelope and creates or preserves one correlation UUID.
3. The RYTHM router produces a routing decision.
4. Provider eligibility is checked independently of technical adapter availability.
5. The registered provider adapter performs transport only.
6. Provider errors are converted to redacted, standardized Gateway errors.
7. The response returns the output and routing decision under the same correlation identifier.

The Gateway does not grant tool permission, resolve connector credentials, execute external actions or replace approval policy.

## Provider states

The provider eligibility abstraction distinguishes:

- registered provider;
- technically supported provider;
- environment-enabled provider;
- production-approved provider;
- eligible routing candidate.

OpenAI is the only Phase 1 production-approved provider. Anthropic and Google remain registered and technically supported, but cannot become production candidates before their separate compliance/security approval. Vercel AI Gateway is not used and is not the policy source of truth.

## Compatibility

- Existing `runAgent` callers continue to work.
- `runtime_provider` and `runtime_model` remain available as a legacy fallback.
- Adaptive Gateway requests do not require a legacy model when normal routing succeeds.
- A router failure cannot use a legacy fallback unless the caller explicitly supplied both provider and model.
- Fixed-model execution remains an explicit future policy exception rather than the default Agent identity.

## Security invariants

- Tenant context is required by the canonical request contract.
- Provider credentials remain server-side inside transport code.
- Provider eligibility cannot grant user, Agent or tool permission.
- Non-approved providers cannot execute through the canonical Gateway in Production.
- Policy and budget denials are normalized as non-retryable errors.
- Error messages pass through the Phase 0 secret-redaction primitive.
- Raw prompts, responses and chain-of-thought are not added to telemetry in Phase 1A.
- Demo remains synthetic and no Demo path is connected to the Gateway by this release.

## Release and rollback

Phase 1A has no database migration and changes no production routing mode. Rollback is a code revert. Existing callers remain compatible because they have not yet been migrated to the new entry point.
