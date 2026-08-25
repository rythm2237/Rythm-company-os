# Phase 1B — Routing Modes and Telemetry

## Rollout contract

The RYTHM Gateway resolves rollout configuration in this order: global default, matching environment, then organization override. Organization is the most specific scope. Missing or malformed configuration resolves to `off`. An applicable database kill switch or `RYTHM_AI_ROUTING_KILL_SWITCH=true` forces `off`; the database control avoids requiring a deployment and is cached for at most five seconds.

- `off`: the Phase 1A/current execution path remains authoritative and no shadow recommendation is evaluated.
- `shadow`: the router evaluates once, but the current execution path remains authoritative. There is exactly one provider execution and one provider usage/cost event.
- `enforced`: the eligible RYTHM routing result is passed to the provider boundary as authoritative. Production eligibility still permits OpenAI only. Broad Production enforcement is not enabled in Phase 1B.

## Telemetry boundary

`request_id` is the canonical correlation ID. `ai_routing_decisions` stores proposed and actual provider/model/tier separately, rollout mode, language, intent, task/operation, complexity, risk, reasoning, reason codes, fallback/escalation, token usage, estimated and actual cost, provider/gateway/total latency, normalized outcome/error class, router version, policy version and pricing version.

Telemetry intentionally stores no prompt, response, attachment, chain-of-thought, credential or provider payload. Errors pass through the Phase 0 redaction primitive. Estimated cost and actual cost are never merged. Actual cost is null when reliable usage or a versioned model price is unavailable.

Legacy classification and selection columns are nullable after this migration because a routing failure may occur before a provider/model exists. This records honest nulls rather than fabricated values.

Telemetry persistence is operational by default: a valid advisory request continues when best-effort telemetry storage fails, with a redacted operational warning. A future governance-critical caller may set `telemetryPolicy: "required"`; that caller fails closed if telemetry cannot be persisted. External execution is outside Phase 1B.

## Security and compatibility

Routing telemetry remains tenant data. Authenticated reads are restricted by organization membership. Anonymous access is revoked. Existing authenticated inserts remain available under the existing user-and-membership RLS policy for backward compatibility; durable Gateway finalization uses the server-side service role. The service role grants do not create an authenticated read path.

`runtime_model` remains optional. Telemetry distinguishes adaptive routing, legacy fallback and explicit fixed-model exceptions. The Phase 1A direct-provider inventory and CI freeze remain authoritative; Phase 1B migrates no direct-provider caller.

## Migration and rollback

Migration: `20260825085135_phase1b_routing_modes_telemetry.sql`.

Rollback procedure:

1. Set the global or applicable organization kill switch to `true`, or set its mode to `off`.
2. Revert the Phase 1B application commit.
3. Preserve telemetry columns by default so historical observations remain readable.
4. If schema rollback is required after confirming no Phase 1B writer remains, drop the Phase 1B index and rollout table, restore the prior grants/policies, then drop only the columns introduced by this migration. No existing Phase 1A column or row is deleted by the forward migration.
