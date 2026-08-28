-- RYTHM OS — Advertising Agency marketplace copy alignment
-- Keep the Ready Company catalog description consistent with the 11-Agent roster after GTM addition.

begin;

update public.company_templates
set description = 'A governed AI advertising company with 11 specialized AI Agents covering strategy and GTM, client accounts, creative, content, performance marketing, analytics, finance/accounting, legal/compliance, and operations/people under Human CEO authority.',
    updated_at = now()
where template_key = 'ready_ai_advertising_agency_v1'
  and version = '1.0';

commit;
