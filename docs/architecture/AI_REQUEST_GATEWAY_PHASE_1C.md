# Phase 1C — Request Intelligence and Adaptive Routing v2

## Boundary

Phase 1C improves the recommendation produced inside the RYTHM-owned AI Request Gateway. It does not migrate a new Production call path and does not broadly enable `enforced`. Phase 1B `off`, `shadow`, organization pilot control and the server-side kill switch remain authoritative.

The decision flow is:

1. authenticated organization and Agent context;
2. deterministic, content-minimized Request Intelligence;
3. governance and entitlement signals;
4. provider-independent capability requirements;
5. Production-eligible model candidates;
6. cost/latency-aware selection among candidates that meet the minimum requirement;
7. structured reasons and versioned telemetry.

Routing never grants tool permission, connector access or approval. A denied or unknown permission is a routing signal and possible escalation, not execution authority. High-impact actions remain subject to the existing canonical permission and approval systems.

## Versioned Request Intelligence

- Classifier: `request-intelligence-v2.0.0`
- Intent taxonomy: `rythm-intents-v1`
- Router: `adaptive-router-v2.0.0`
- Adaptive policy: `adaptive-policy-v2.0.0`, overridable by an explicit organization policy version
- Model registry: `rythm-model-registry-2026-08-25-v2`, overridable only with an explicit registry version

The controlled intent taxonomy contains: information, drafting, analysis, planning, decision support, summarization, transformation, coding, tool execution, workflow coordination, meeting deliberation, knowledge retrieval and high-impact action.

Language detection combines Unicode script evidence with language lexicons. It records detected request languages separately from the requested response language. Current validation covers English, Persian, mixed Persian/English, Japanese, French and German. Unknown signals remain neutral; raw prompts and hidden reasoning are not persisted.

Complexity is `low`, `medium` or `high`. It uses explicit structural evidence such as multi-step synthesis, constraints, ambiguity, cross-department work, technical depth, context breadth and tool dependencies. Prompt length alone cannot make a request high complexity.

Reasoning depth is provider-independent: `minimal`, `standard`, `deep` or `expert`. Provider adapters continue to receive their supported low/medium/high transport setting.

## Capability tiers and registry

Capability tiers are `fast`, `standard`, `advanced_reasoning`, `high_accuracy`, `coding`, `multimodal`, `specialized` and `fallback`. The existing `luna`, `terra` and `sol` names remain as backward-compatible compute lanes and entitlement keys; they are not Agent identities or public model policy.

Each registry candidate describes provider/model, capability tiers, modalities, context window, reasoning depths, coding/language suitability, tool support, latency/cost profiles, availability and fallback priority. Environment overrides are parsed conservatively; invalid provider configuration disables the candidate.

Production eligibility is evaluated independently. OpenAI is the only Production-approved provider. Anthropic and Google remain registered and technically supported but are filtered before recommendation or execution. Shadow mode therefore recommends only realistic Production-eligible candidates.

## Selection and fallback

The router first filters for provider eligibility, tenant entitlement, Agent tier boundaries, model availability, modalities, tool capability, context window and reasoning depth. Cost and latency preferences are applied only after those requirements pass.

No eligible model, context overflow, budget incompatibility, disabled provider/model or an unsafe fixed-model exception fails with structured escalation reason codes. A pure fallback planner is available for timeout, rate-limit, provider-unavailable and unsupported-model outcomes; it excludes the failed model and preserves the original minimum capabilities and Production provider policy. Activating execution-time fallback on migrated Production paths is deferred to Phase 1D.

`runtime_model` remains optional. An explicit fixed model is observable. A registered fixed model must satisfy eligibility and capability rules. An unknown legacy OpenAI model may remain as a compatibility exception with `MODEL_METADATA_UNKNOWN`; it is never silently replaced. Adaptive fallback from fixed mode requires explicit `fixedModelFallback: adaptive`.

## Telemetry and privacy

The Phase 1C migration adds classifier/taxonomy/registry/adaptive-policy versions, proposed/actual capability tier, reasoning depth, authorization signal, human-review signal, context requirement classes, modalities and estimated latency to `ai_routing_decisions`.

It changes no RLS policy or grant. Existing tenant membership policies continue to isolate rows. Telemetry contains structured metadata only: no prompt, response, attachment payload, provider payload, credential or chain-of-thought.

## Known classifier limitations

- Deterministic language detection can be uncertain for very short Latin-script messages or languages outside the validated set.
- Intent and risk rules are deliberately conservative and use a small taxonomy; ambiguous requests may need a later lightweight classifier evaluation.
- Token and latency values are estimates until provider usage and observed latency exist.
- Tool requirement detection identifies capability need but does not know connector availability beyond the Agent policy supplied to the request.
- Full budget hierarchy, outcome-based model quality and telemetry-informed latency calibration are later phases.

## Deferred to Phase 1D

Production path migration, Boardroom migration, company-library ingestion migration, execution-time fallback activation and broad enforcement remain deferred. The Phase 1A direct-provider inventory and CI guard remain unchanged.

## Migration and rollback

Migration: `20260825100348_phase1c_request_intelligence_telemetry.sql`.

Rollback:

1. force the applicable rollout to `off` with the Phase 1B kill switch;
2. revert the Phase 1C application release;
3. normally retain the additive telemetry columns so historical decisions remain interpretable;
4. if physical schema rollback is required after all Phase 1C writers are removed, drop only the twelve columns added by the migration. Existing rows, Phase 1B columns, RLS policies and grants require no restoration.
