-- Extend first-party SEO/GEO/AEO reporting to confirmed signup and qualified enterprise outcomes.
-- Analytics remains identity-free. Enterprise intake identity is stored separately only for explicit sales follow-up.

alter table public.public_analytics_events
  drop constraint if exists public_analytics_event_name_check;

alter table public.public_analytics_events
  add constraint public_analytics_event_name_check check (
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
      'enterprise_inquiry_conversion',
      'confirmed_signup_conversion',
      'qualified_enterprise_lead_conversion'
    )
  );

alter table public.public_analytics_events
  drop constraint if exists public_analytics_conversion_type_check;

alter table public.public_analytics_events
  add constraint public_analytics_conversion_type_check check (
    conversion_type is null or conversion_type in (
      'demo',
      'signup',
      'enterprise_inquiry',
      'confirmed_signup',
      'qualified_enterprise_lead'
    )
  );

create table if not exists public.enterprise_lead_intake (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  work_email text not null,
  company_name text not null,
  job_title text not null,
  company_size_bucket text not null,
  deployment_timeline text not null,
  decision_role text not null,
  use_case text not null,
  qualification_status text not null,
  attribution_kind text null,
  attribution_source text null,
  landing_path text null,
  referrer_host text null,
  created_at timestamptz not null default now(),
  constraint enterprise_lead_company_size_check check (
    company_size_bucket in ('1_49', '50_199', '200_999', '1000_plus')
  ),
  constraint enterprise_lead_timeline_check check (
    deployment_timeline in ('0_3m', '3_6m', '6_12m', '12m_plus', 'exploring')
  ),
  constraint enterprise_lead_decision_role_check check (
    decision_role in ('decision_maker', 'executive_sponsor', 'evaluator', 'researcher')
  ),
  constraint enterprise_lead_use_case_check check (
    use_case in ('operations', 'customer_support', 'sales_marketing', 'research_analysis', 'software_delivery', 'other')
  ),
  constraint enterprise_lead_qualification_check check (
    qualification_status in ('marketing_qualified', 'not_yet_qualified')
  ),
  constraint enterprise_lead_attribution_kind_check check (
    attribution_kind is null or attribution_kind in ('ai', 'organic')
  )
);

comment on table public.enterprise_lead_intake is
  'Explicit Enterprise Beta intake for sales follow-up. Identity/contact data is separate from identity-free public analytics.';
comment on column public.enterprise_lead_intake.qualification_status is
  'Server-derived MQL state. Marketing-qualified requires a non-consumer work email, 50+ employee organization, deployment horizon within six months, and decision-maker or executive-sponsor responsibility.';

create index if not exists enterprise_lead_intake_created_at_idx
  on public.enterprise_lead_intake (created_at desc);
create index if not exists enterprise_lead_intake_qualification_idx
  on public.enterprise_lead_intake (qualification_status, created_at desc);

alter table public.enterprise_lead_intake enable row level security;
revoke all on table public.enterprise_lead_intake from anon, authenticated;
grant select, insert, update on table public.enterprise_lead_intake to service_role;
