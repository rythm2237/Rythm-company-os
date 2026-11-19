-- The Agency roster predates the marketing benchmark's mandatory specialization.
-- Bind existing role-specific knowledge for future installations.
begin;

with mappings(template_key, specialization_key) as (
  values
    ('advertising_account_manager', 'b2b_marketing'),
    ('advertising_content_specialist', 'content_marketing'),
    ('advertising_copywriter', 'content_marketing'),
    ('advertising_performance_marketing', 'performance_marketing'),
    ('advertising_strategy_director', 'b2b_marketing')
)
update public.agent_templates t
set default_specializations = array[m.specialization_key], updated_at = now()
from mappings m
join public.role_specializations s
  on s.role_family = 'marketing' and s.specialization_key = m.specialization_key and s.active
where t.template_key = m.template_key and t.version = '1.0'
  and t.role_family = 'marketing' and cardinality(t.default_specializations) = 0;

commit;
