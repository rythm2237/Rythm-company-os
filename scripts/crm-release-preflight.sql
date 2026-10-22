-- Read-only release gate. Run after schema rollout/reconciliation; every count must be zero.
select 'active_projects_without_manager' as blocker,count(*) from public.projects
where lower(status) not in ('completed','cancelled','archived','failed') and primary_manager_user_id is null
union all select 'active_projects_pending_reconciliation',count(*) from public.projects where crm_reconciliation_required and lower(status) not in ('completed','cancelled','archived','failed')
union all select 'active_projects_with_ineligible_manager',count(*) from public.projects p
where lower(p.status) not in ('completed','cancelled','archived','failed') and p.primary_manager_user_id is not null
and not exists(select 1 from public.organization_members m where m.organization_id=p.organization_id and m.user_id=p.primary_manager_user_id and m.membership_status='active')
union all select 'external_projects_without_customer',count(*) from public.projects where engagement_type='external' and customer_id is null
union all select 'contracts_without_customer',count(*) from public.project_contracts where customer_id is null
union all select 'confidential_chunks_wrongly_classified',count(*) from public.project_document_chunks c join public.project_documents d on d.id=c.document_id where c.confidentiality<>d.confidentiality
union all select 'public_project_file_bucket',count(*) from storage.buckets where id='project-files' and public;
