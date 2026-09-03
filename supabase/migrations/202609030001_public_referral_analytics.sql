-- Privacy-safe first-party public referral and conversion analytics.
-- No IP address, user-agent, email, user id, raw referrer URL, or free-text payload is stored.

create table if not exists public.public_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  occurred_at timestamptz not null default now(),
  path text null,
  attribution_kind text null,
  attribution_source text null,
  landing_path text null,
  referrer_host text null,
  conversion_type text null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint public_analytics_event_name_check check (
    event_name in (
      'tour_prompt_seen',
      'tour_started',
      'tour_language_selected',
      'tour_step_viewed',
      'tour_skipped',
      'tour_completed',
      'explain_mode_enabled',
      'explain_mode_disabled',
      'explanation_viewed',
      'experience_mode_discovered',
      'experience_mode_entered',
      'experience_mode_exited',
      'demo_get_started_clicked',
      'demo_sign_in_clicked',
      'solution_finder_started',
      'solution_finder_dismissed',
      'solution_finder_answered',
      'solution_finder_recommended',
      'solution_finder_primary_clicked',
      'solution_finder_meeting_clicked',
      'ai_referral_detected',
      'organic_referral_detected',
      'demo_conversion',
      'signup_conversion',
      'enterprise_inquiry_conversion'
    )
  ),
  constraint public_analytics_attribution_kind_check check (
    attribution_kind is null or attribution_kind in ('ai', 'organic')
  ),
  constraint public_analytics_conversion_type_check check (
    conversion_type is null or conversion_type in ('demo', 'signup', 'enterprise_inquiry')
  ),
  constraint public_analytics_properties_object_check check (jsonb_typeof(properties) = 'object')
);

comment on table public.public_analytics_events is
  'Content-minimized first-party public referral/conversion events for SEO/GEO/AEO measurement. No identity, IP, raw referrer URL, user-agent, email, or free text.';

create index if not exists public_analytics_events_occurred_at_idx
  on public.public_analytics_events (occurred_at desc);
create index if not exists public_analytics_events_event_name_idx
  on public.public_analytics_events (event_name, occurred_at desc);
create index if not exists public_analytics_events_attribution_idx
  on public.public_analytics_events (attribution_kind, attribution_source, occurred_at desc);
create index if not exists public_analytics_events_landing_path_idx
  on public.public_analytics_events (landing_path, occurred_at desc);

alter table public.public_analytics_events enable row level security;
revoke all on table public.public_analytics_events from anon, authenticated;
grant select, insert on table public.public_analytics_events to service_role;

create or replace view public.public_analytics_monthly as
select
  date_trunc('month', occurred_at) as month,
  event_name,
  attribution_kind,
  attribution_source,
  landing_path,
  conversion_type,
  count(*)::bigint as event_count
from public.public_analytics_events
group by 1, 2, 3, 4, 5, 6;

revoke all on table public.public_analytics_monthly from anon, authenticated;
grant select on table public.public_analytics_monthly to service_role;
