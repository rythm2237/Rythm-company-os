-- RYTHM OS Phase 1C — Request Intelligence v2 telemetry metadata.
-- Additive only: existing routing rows, RLS policies and grants are unchanged.

alter table public.ai_routing_decisions
  add column if not exists intent_taxonomy_version text,
  add column if not exists classifier_version text,
  add column if not exists adaptive_policy_version text,
  add column if not exists model_registry_version text,
  add column if not exists proposed_capability_tier text
    check (proposed_capability_tier is null or proposed_capability_tier in (
      'fast', 'standard', 'advanced_reasoning', 'high_accuracy', 'coding', 'multimodal', 'specialized', 'fallback'
    )),
  add column if not exists actual_capability_tier text
    check (actual_capability_tier is null or actual_capability_tier in (
      'fast', 'standard', 'advanced_reasoning', 'high_accuracy', 'coding', 'multimodal', 'specialized', 'fallback'
    )),
  add column if not exists reasoning_depth text
    check (reasoning_depth is null or reasoning_depth in ('minimal', 'standard', 'deep', 'expert')),
  add column if not exists authorization_signal text
    check (authorization_signal is null or authorization_signal in ('not_required', 'allowed', 'denied', 'unknown')),
  add column if not exists human_review_required boolean not null default false,
  add column if not exists context_requirements jsonb not null default '[]'::jsonb,
  add column if not exists required_modalities jsonb not null default '[]'::jsonb,
  add column if not exists estimated_latency_ms integer
    check (estimated_latency_ms is null or estimated_latency_ms >= 0);

comment on column public.ai_routing_decisions.policy_version is
  'Phase 1B rollout policy version retained for backward compatibility.';
comment on column public.ai_routing_decisions.adaptive_policy_version is
  'Request-specific adaptive routing policy version used to produce the decision.';
comment on column public.ai_routing_decisions.classifier_version is
  'Version of the deterministic Request Intelligence classifier.';
comment on column public.ai_routing_decisions.model_registry_version is
  'Version of the model capability and pricing registry used for candidate selection.';
comment on column public.ai_routing_decisions.reasoning_depth is
  'Provider-independent reasoning requirement: minimal, standard, deep or expert.';
comment on column public.ai_routing_decisions.authorization_signal is
  'Routing observation only. It never grants permission or replaces approval enforcement.';
