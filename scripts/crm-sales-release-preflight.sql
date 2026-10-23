-- Read-only after staging migration. Investigate every nonzero result before rollout.
select 'unmapped_sales_stage' as blocker,count(*) from public.crm_opportunities o
where not exists(select 1 from public.crm_pipeline_stages s where s.organization_id=o.organization_id and s.code=o.stage_code)
union all select 'inconsistent_sales_outcome',count(*) from public.crm_opportunities o join public.crm_pipeline_stages s on s.organization_id=o.organization_id and s.code=o.stage_code
where o.status<>case when not s.is_closed then 'open' when s.is_won then 'won' else 'lost' end
union all select 'duplicate_normalized_name',count(*) from (select organization_id,lower(btrim(name)) from public.crm_accounts group by 1,2 having count(*)>1)d
union all select 'legacy_projects_pending_owner_confirmation',count(*) from public.projects where crm_reconciliation_required;
-- Also run scripts/crm-release-preflight.sql for the shared CRM foundation.
