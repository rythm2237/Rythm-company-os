-- Shared CRM: additive domain extension. No production data deletion or inferred owners.
begin;
create schema if not exists crm_private;
revoke all on schema crm_private from public,anon;
grant usage on schema crm_private to authenticated,service_role;

-- Exact domain permissions extend existing organization_members and agents, not identity.
create table public.crm_access_grants (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 principal_type text not null check(principal_type in ('user','agent')), principal_id uuid not null,
 capability text not null check(capability in ('customer.read','customer.create','customer.update','customer.archive','contract.read','contract.create','contract.update','contract.approve','contract.manage_access','finance.read','finance.create','finance.update','finance.approve','finance.manage_access','project.read','project.create','project.update','project.assign_manager','project.manage_access')),
 resource_type text not null check(resource_type in ('company','customer','contract','project')),resource_id uuid not null,
 granted_by uuid not null, created_at timestamptz not null default now(),revoked_at timestamptz,
 unique(organization_id,principal_type,principal_id,capability,resource_type,resource_id)
);
create index crm_access_lookup on public.crm_access_grants(organization_id,principal_type,principal_id,capability) where revoked_at is null;
create table public.crm_audit_log (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 actor_user_id uuid, event_type text not null,resource_type text not null,resource_id uuid not null,
 visibility text not null default 'operational' check(visibility in ('operational','contract','finance','access')),
 detail jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table public.crm_access_grants enable row level security;
alter table public.crm_audit_log enable row level security;


alter table public.crm_accounts add column legal_name text,add column registration_number text,add column vat_number text,
 add column address text,add column preferred_language text,add column tags text[] not null default '{}',
 add column customer_status text not null default 'lead' check(customer_status in ('lead','prospect','active','inactive','archived')),
 add constraint crm_accounts_org_id unique(organization_id,id);
alter table public.crm_contacts add column contact_role text,add column communication_method text,
 add constraint crm_contacts_org_id unique(organization_id,id),
 add constraint crm_contacts_account_tenant foreign key(organization_id,account_id) references public.crm_accounts(organization_id,id) not valid;
alter table public.crm_opportunities add constraint crm_opportunities_account_tenant foreign key(organization_id,account_id) references public.crm_accounts(organization_id,id) not valid,
 add constraint crm_opportunities_contact_tenant foreign key(organization_id,primary_contact_id) references public.crm_contacts(organization_id,id) not valid;
alter table public.crm_activities add column visibility text not null default 'operational' check(visibility in ('operational','contract','finance')),
 add constraint crm_activities_account_tenant foreign key(organization_id,account_id) references public.crm_accounts(organization_id,id) not valid;
-- Existing opportunity-linked history is commercial until reviewed; do not expose past summaries.
update public.crm_activities set visibility='finance' where opportunity_id is not null or activity_type in ('proposal','stage_change');
update public.crm_accounts set customer_status=case lifecycle_stage when 'customer' then 'active' when 'former_customer' then 'inactive' when 'prospect' then 'prospect' else 'lead' end;

alter table public.projects add column customer_id uuid,add column engagement_type text not null default 'internal' check(engagement_type in ('internal','external')),
 add column primary_manager_user_id uuid references auth.users(id),
 add column crm_reconciliation_required boolean not null default false,
 add constraint projects_org_id unique(organization_id,id),
 add constraint projects_manager_company foreign key(organization_id,primary_manager_user_id) references public.organization_members(organization_id,user_id),
 add constraint projects_customer_tenant foreign key(organization_id,customer_id) references public.crm_accounts(organization_id,id);
-- Preserve legacy project state. Release gate requires explicit reconciliation of these rows.
update public.projects set crm_reconciliation_required=true;
create index projects_customer_manager on public.projects(organization_id,customer_id,primary_manager_user_id);
create table public.project_manager_history (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,project_id uuid not null,
 previous_manager_user_id uuid,new_manager_user_id uuid not null,actor_user_id uuid,reason text,
 created_at timestamptz not null default now(),foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
alter table public.project_manager_history enable row level security;

-- Extend the existing contract entity. project_id remains the legacy originating project;
-- authoritative many-to-many relations are in project_contract_links.
alter table public.project_contracts alter column project_id drop not null;
alter table public.project_contracts add column customer_id uuid,
 add column contract_status text not null default 'draft' check(contract_status in ('draft','pending_approval','approved','active','expired','archived')),
 add column renewal_date date,add column amendment_of uuid references public.project_contracts(id),
 add column scope_description text,add column crm_reconciliation_required boolean not null default false,
 add constraint project_contracts_org_id unique(organization_id,id),
 add constraint contract_customer_tenant foreign key(organization_id,customer_id) references public.crm_accounts(organization_id,id),
 add constraint contract_project_tenant foreign key(organization_id,project_id) references public.projects(organization_id,id) not valid;
update public.project_contracts set crm_reconciliation_required=true where customer_id is null;
create table public.project_contract_links (
 organization_id uuid not null,project_id uuid not null,contract_id uuid not null,
 primary key(project_id,contract_id),
 foreign key(organization_id,project_id) references public.projects(organization_id,id),
 foreign key(organization_id,contract_id) references public.project_contracts(organization_id,id)
);
alter table public.project_contract_links enable row level security;
insert into public.project_contract_links select organization_id,project_id,id from public.project_contracts where project_id is not null;

alter table public.finance_invoices add column customer_id uuid,add column project_id uuid,add column contract_id uuid,
 add constraint finance_invoices_org_id unique(organization_id,id),
 add constraint invoice_customer_tenant foreign key(organization_id,customer_id) references public.crm_accounts(organization_id,id),
 add constraint invoice_project_tenant foreign key(organization_id,project_id) references public.projects(organization_id,id),
 add constraint invoice_contract_tenant foreign key(organization_id,contract_id) references public.project_contracts(organization_id,id);
alter table public.finance_transactions add column customer_id uuid,add column project_id uuid,add column contract_id uuid,add column invoice_id uuid,
 add constraint transaction_customer_tenant foreign key(organization_id,customer_id) references public.crm_accounts(organization_id,id),
 add constraint transaction_project_tenant foreign key(organization_id,project_id) references public.projects(organization_id,id),
 add constraint transaction_contract_tenant foreign key(organization_id,contract_id) references public.project_contracts(organization_id,id),
 add constraint transaction_invoice_tenant foreign key(organization_id,invoice_id) references public.finance_invoices(organization_id,id);
alter table public.finance_invoice_lines add constraint invoice_lines_tenant foreign key(organization_id,invoice_id) references public.finance_invoices(organization_id,id) not valid;
create index invoice_customer on public.finance_invoices(organization_id,customer_id);
create index transaction_customer on public.finance_transactions(organization_id,customer_id);

create function crm_private.has_capability(org uuid,cap text,kind text,rid uuid,ptype text,pid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select pid is not null and
 case when ptype='user' then exists(select 1 from public.organization_members m where m.organization_id=org and m.user_id=pid and m.membership_status='active')
 when ptype='agent' then exists(select 1 from public.agents a where a.organization_id=org and a.id=pid and a.enabled) else false end
 and exists(select 1 from public.crm_access_grants g where g.organization_id=org and g.principal_type=ptype and g.principal_id=pid and g.capability=cap and g.revoked_at is null and
 ((g.resource_type='company' and g.resource_id=org) or (g.resource_type=kind and g.resource_id=rid) or
 (g.resource_type='customer' and kind='contract' and exists(select 1 from public.project_contracts c where c.id=rid and c.organization_id=org and c.customer_id=g.resource_id)) or
 (g.resource_type='customer' and kind='project' and exists(select 1 from public.projects p where p.id=rid and p.organization_id=org and p.customer_id=g.resource_id))))
$$;
revoke all on function crm_private.has_capability(uuid,text,text,uuid,text,uuid) from public,anon,authenticated;
-- Only auth.uid can select a human principal. The arbitrary-principal function is service-only.
grant execute on function crm_private.has_capability(uuid,text,text,uuid,text,uuid) to service_role;
create function crm_private.can_access(org uuid,cap text,kind text,rid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
 crm_private.has_capability(org,cap,kind,rid,'user',auth.uid()) or
 (cap in ('customer.read','project.read') and public.is_org_member(org)) or
 (cap in ('customer.create','customer.update','customer.archive','project.create','project.update','project.assign_manager','project.manage_access','contract.manage_access','finance.manage_access') and public.is_org_owner(org)))
$$;
revoke all on function crm_private.can_access(uuid,text,text,uuid) from public,anon;
grant execute on function crm_private.can_access(uuid,text,text,uuid) to authenticated,service_role;
create function public.crm_can(p_organization_id uuid,p_capability text,p_resource_type text default 'company',p_resource_id uuid default null) returns boolean
language sql stable security invoker set search_path='' as $$select crm_private.can_access(p_organization_id,p_capability,p_resource_type,coalesce(p_resource_id,p_organization_id))$$;
revoke all on function public.crm_can(uuid,text,text,uuid) from public,anon;
grant execute on function public.crm_can(uuid,text,text,uuid) to authenticated;

-- Generic audit contains event type and changed column names, never confidential values.
create function crm_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end; vis text:=tg_argv[0];
begin
 insert into public.crm_audit_log(organization_id,actor_user_id,event_type,resource_type,resource_id,visibility,detail)
 values((row_data->>'organization_id')::uuid,auth.uid(),lower(tg_op),tg_table_name,(row_data->>'id')::uuid,vis,'{}');
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function crm_private.audit_change() from public,anon,authenticated;
create trigger crm_account_audit after insert or update on public.crm_accounts for each row execute function crm_private.audit_change('operational');
create trigger crm_contact_audit after insert or update or delete on public.crm_contacts for each row execute function crm_private.audit_change('operational');
create trigger crm_contract_audit after insert or update on public.project_contracts for each row execute function crm_private.audit_change('contract');
create trigger crm_finance_audit after insert or update on public.finance_invoices for each row execute function crm_private.audit_change('finance');
create trigger crm_grant_audit after insert or update or delete on public.crm_access_grants for each row execute function crm_private.audit_change('access');

create function crm_private.validate_grant() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not public.is_org_owner(new.organization_id) then raise exception 'Only the active company owner can administer access'; end if;
 if tg_op='UPDATE' and (new.organization_id,new.principal_type,new.principal_id,new.capability,new.resource_type,new.resource_id) is distinct from (old.organization_id,old.principal_type,old.principal_id,old.capability,old.resource_type,old.resource_id) then raise exception 'Revoke the grant before creating a different scope'; end if;
 if new.principal_type='user' and not exists(select 1 from public.organization_members where organization_id=new.organization_id and user_id=new.principal_id and membership_status='active') then raise exception 'Invalid company member'; end if;
 if new.principal_type='agent' and not exists(select 1 from public.agents where organization_id=new.organization_id and id=new.principal_id and enabled) then raise exception 'Invalid company agent'; end if;
 if new.resource_type='company' and new.resource_id<>new.organization_id or
 new.resource_type='customer' and not exists(select 1 from public.crm_accounts where id=new.resource_id and organization_id=new.organization_id) or
 new.resource_type='project' and not exists(select 1 from public.projects where id=new.resource_id and organization_id=new.organization_id) or
 new.resource_type='contract' and not exists(select 1 from public.project_contracts where id=new.resource_id and organization_id=new.organization_id) then raise exception 'Invalid resource scope'; end if;
 new.granted_by:=auth.uid();return new;
end $$;
revoke all on function crm_private.validate_grant() from public,anon,authenticated;
create trigger crm_validate_grant before insert or update on public.crm_access_grants for each row execute function crm_private.validate_grant();

create function crm_private.project_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare changed boolean;
begin
 changed:=tg_op='INSERT' or (new.primary_manager_user_id,new.customer_id,new.engagement_type) is distinct from (old.primary_manager_user_id,old.customer_id,old.engagement_type);
 if tg_op='INSERT' or changed or not new.crm_reconciliation_required then
  if new.primary_manager_user_id is null then raise exception 'Exactly one primary project manager is required'; end if;
  if not exists(select 1 from public.organization_members m where m.organization_id=new.organization_id and m.user_id=new.primary_manager_user_id and m.membership_status='active') then raise exception 'Project manager must be an active company member'; end if;
  if new.engagement_type='external' and new.customer_id is null then raise exception 'External projects require a customer'; end if;
  if new.engagement_type='internal' and new.customer_id is not null then raise exception 'Internal projects cannot reference an external customer'; end if;
  if tg_op='INSERT' then new.crm_reconciliation_required:=false;end if;
 end if;
 if tg_op='UPDATE' and new.organization_id<>old.organization_id then raise exception 'Project company cannot be changed'; end if;
 if tg_op='UPDATE' and not old.crm_reconciliation_required and new.crm_reconciliation_required then raise exception 'Reconciled projects cannot be exempted from ownership rules';end if;
 if tg_op='UPDATE' and old.crm_reconciliation_required and not new.crm_reconciliation_required and (not crm_private.can_access(new.organization_id,'project.update','project',new.id) or not crm_private.can_access(new.organization_id,'project.assign_manager','project',new.id)) then raise exception 'Explicit project reconciliation authorization required';end if;
 if tg_op='UPDATE' and new.customer_id is distinct from old.customer_id and (
 exists(select 1 from public.project_contract_links l join public.project_contracts c on c.id=l.contract_id where l.project_id=new.id and c.customer_id is distinct from new.customer_id) or
 exists(select 1 from public.finance_invoices i where i.project_id=new.id and i.customer_id is distinct from new.customer_id)) then raise exception 'Reconcile linked commercial records before changing the customer';end if;

 if changed and auth.uid() is not null and not crm_private.can_access(new.organization_id,'project.assign_manager','project',new.id) then raise exception 'Project ownership permission required'; end if;
 if tg_op='INSERT' and auth.uid() is null then raise exception 'An accountable user must create projects'; end if;
 if tg_op='UPDATE' and new.primary_manager_user_id is distinct from old.primary_manager_user_id then
  if auth.uid() is null then raise exception 'Manager reassignment requires a user'; end if;
  insert into public.project_manager_history(organization_id,project_id,previous_manager_user_id,new_manager_user_id,actor_user_id,reason)
  values(new.organization_id,new.id,old.primary_manager_user_id,new.primary_manager_user_id,auth.uid(),nullif(current_setting('rythm.manager_reason',true),''));
 end if;
 return new;
end $$;
revoke all on function crm_private.project_guard() from public,anon,authenticated;
create trigger crm_project_guard before insert or update on public.projects for each row execute function crm_private.project_guard();
create function public.crm_assign_project_manager(p_project_id uuid,p_manager_id uuid,p_reason text default null) returns void language plpgsql security invoker set search_path='' as $$
declare org uuid;
begin
 select organization_id into org from public.projects where id=p_project_id for update;
 if org is null or not public.crm_can(org,'project.assign_manager','project',p_project_id) then raise exception 'Project ownership permission required'; end if;
 perform set_config('rythm.manager_reason',left(coalesce(p_reason,''),1000),true);
 update public.projects set primary_manager_user_id=p_manager_id where id=p_project_id and organization_id=org;
end $$;
revoke all on function public.crm_assign_project_manager(uuid,uuid,text) from public,anon;
grant execute on function public.crm_assign_project_manager(uuid,uuid,text) to authenticated;

create function crm_private.contract_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.customer_id is null and (tg_op='INSERT' or not new.crm_reconciliation_required) then raise exception 'A contract requires exactly one customer'; end if;
 if new.customer_id is not null then new.crm_reconciliation_required:=false; end if;
 if tg_op='UPDATE' and new.organization_id<>old.organization_id then raise exception 'Contract company cannot be changed'; end if;
 if new.project_id is not null and not exists(select 1 from public.projects p where p.id=new.project_id and p.organization_id=new.organization_id and p.customer_id=new.customer_id) then raise exception 'Contract and project customers must match'; end if;
 if new.amendment_of is not null and not exists(select 1 from public.project_contracts c where c.id=new.amendment_of and c.organization_id=new.organization_id and c.customer_id=new.customer_id and c.id<>new.id) then raise exception 'Invalid parent contract'; end if;
 if new.contract_status in ('approved','active') and (tg_op='INSERT' or new.contract_status is distinct from old.contract_status) and not crm_private.can_access(new.organization_id,'contract.approve','contract',new.id) then raise exception 'Explicit contract approval permission required'; end if;
 return new;
end $$;
revoke all on function crm_private.contract_guard() from public,anon,authenticated;
create trigger crm_contract_guard before insert or update on public.project_contracts for each row execute function crm_private.contract_guard();

create function crm_private.relationship_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.project_id is not null and not exists(select 1 from public.projects p where p.id=new.project_id and p.organization_id=new.organization_id and p.customer_id is not distinct from new.customer_id) then raise exception 'Project customer mismatch'; end if;
 if new.contract_id is not null and not exists(select 1 from public.project_contracts c where c.id=new.contract_id and c.organization_id=new.organization_id and c.customer_id is not distinct from new.customer_id) then raise exception 'Contract customer mismatch'; end if;
 return new;
end $$;
revoke all on function crm_private.relationship_guard() from public,anon,authenticated;
create trigger crm_invoice_relations before insert or update on public.finance_invoices for each row execute function crm_private.relationship_guard();
create trigger crm_transaction_relations before insert or update on public.finance_transactions for each row execute function crm_private.relationship_guard();
create function crm_private.link_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.projects p join public.project_contracts c on c.organization_id=p.organization_id and c.customer_id=p.customer_id where p.id=new.project_id and c.id=new.contract_id and p.organization_id=new.organization_id) then raise exception 'Project and contract customers must match'; end if;return new;
end $$;
revoke all on function crm_private.link_guard() from public,anon,authenticated;
create trigger crm_link_guard before insert or update on public.project_contract_links for each row execute function crm_private.link_guard();

-- Restrictive policies AND with old policies, so a legacy permissive policy cannot reopen access.
create policy crm_grants_read on public.crm_access_grants for select to authenticated using(public.is_org_owner(organization_id) or (principal_type='user' and principal_id=auth.uid() and public.is_org_member(organization_id)));
create policy crm_grants_insert on public.crm_access_grants for insert to authenticated with check(public.is_org_owner(organization_id));
create policy crm_grants_update on public.crm_access_grants for update to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));
create policy crm_audit_read on public.crm_audit_log for select to authenticated using(
 (visibility='operational' and public.is_org_member(organization_id)) or (visibility='access' and public.is_org_owner(organization_id)) or
 (visibility in ('contract','finance') and public.crm_can(organization_id,visibility||'.read')));
create policy crm_manager_history on public.project_manager_history for select to authenticated using(public.is_org_member(organization_id));
create policy crm_links_read on public.project_contract_links for select to authenticated using(public.crm_can(organization_id,'contract.read','contract',contract_id));
create policy crm_links_insert on public.project_contract_links for insert to authenticated with check(public.crm_can(organization_id,'contract.update','contract',contract_id) and public.crm_can(organization_id,'project.update','project',project_id));
create policy crm_links_delete on public.project_contract_links for delete to authenticated using(public.crm_can(organization_id,'contract.update','contract',contract_id));

do $$ declare t text; domain text; kind text; rid text; pol record;begin
 -- Replace existing commercial/financial policies: no implicit role read or write.
 foreach t in array array['project_contracts','crm_opportunities','finance_invoices','finance_transactions','finance_invoice_lines','finance_budgets'] loop
  for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',pol.policyname,t);end loop;
  domain:=case when t='project_contracts' then 'contract' else 'finance' end;
  kind:=case when t='project_contracts' then 'contract' when t in ('finance_invoices','finance_transactions','crm_opportunities') then 'customer' else 'company' end;
  rid:=case when t='project_contracts' then 'id' when t='crm_opportunities' then 'coalesce(account_id,organization_id)' when t in ('finance_invoices','finance_transactions') then 'coalesce(customer_id,organization_id)' else 'organization_id' end;
  if t='finance_invoice_lines' then
   execute 'create policy crm_lines_access on public.finance_invoice_lines for all to authenticated using(exists(select 1 from public.finance_invoices i where i.id=invoice_id and i.organization_id=finance_invoice_lines.organization_id)) with check(exists(select 1 from public.finance_invoices i where i.id=invoice_id and i.organization_id=finance_invoice_lines.organization_id and public.crm_can(i.organization_id,''finance.update'',''customer'',coalesce(i.customer_id,i.organization_id))))';
  else
   execute format('create policy crm_read on public.%I for select to authenticated using(public.crm_can(organization_id,%L,%L,%s))',t,domain||'.read',kind,rid);
   execute format('create policy crm_create on public.%I for insert to authenticated with check(public.crm_can(organization_id,%L,%L,%s))',t,domain||'.create',kind,rid);
   execute format('create policy crm_update on public.%I for update to authenticated using(public.crm_can(organization_id,%L,%L,%s)) with check(public.crm_can(organization_id,%L,%L,%s))',t,domain||'.update',kind,rid,domain||'.update',kind,rid);
   -- Archive records instead of destroying business history.
  end if;
 end loop;
end $$;
-- Operational CRUD follows existing owner/member rules plus exact capabilities.
drop policy crm_accounts_member_access on public.crm_accounts;
drop policy crm_contacts_member_access on public.crm_contacts;
do $$ declare t text; kind text; rid text;begin
 foreach t in array array['crm_accounts','crm_contacts'] loop
  rid:=case when t='crm_accounts' then 'id' else 'account_id' end;
  execute format('create policy crm_read on public.%I for select to authenticated using(public.crm_can(organization_id,''customer.read'',''customer'',%s))',t,rid);
  execute format('create policy crm_create on public.%I for insert to authenticated with check(public.crm_can(organization_id,''customer.create'',''customer'',%s))',t,rid);
  execute format('create policy crm_update on public.%I for update to authenticated using(public.crm_can(organization_id,''customer.update'',''customer'',%s)) with check(public.crm_can(organization_id,''customer.update'',''customer'',%s))',t,rid,rid);
 end loop;
end $$;
create policy crm_activity_confidentiality on public.crm_activities as restrictive for all to authenticated
using(public.is_org_member(organization_id) and (visibility='operational' or public.crm_can(organization_id,visibility||'.read','customer',coalesce(account_id,organization_id))))
with check(public.is_org_member(organization_id) and (visibility='operational' or public.crm_can(organization_id,visibility||'.create','customer',coalesce(account_id,organization_id))));

-- Confidential files and derivatives must not enter shared retrieval or public object access.
alter table public.project_documents add column confidentiality text not null default 'operational' check(confidentiality in ('operational','contract','finance'));
update public.project_documents set confidentiality=case when legal_document or category in ('contract','amendment','nda','statement_of_work') then 'contract' when category='financial' then 'finance' else 'operational' end;
create function crm_private.document_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.legal_document or new.category in ('contract','amendment','nda','statement_of_work') then new.confidentiality:='contract';elsif new.category='financial' then new.confidentiality:='finance';end if;
 if tg_op='UPDATE' and old.confidentiality<>'operational' and new.confidentiality<>old.confidentiality then raise exception 'Confidential files cannot be downgraded'; end if;return new;
end $$;
revoke all on function crm_private.document_guard() from public,anon,authenticated;
create trigger crm_document_guard before insert or update on public.project_documents for each row execute function crm_private.document_guard();
create policy crm_documents_confidentiality on public.project_documents as restrictive for all to authenticated
 using(confidentiality='operational' or public.crm_can(organization_id,confidentiality||'.read','project',project_id))
 with check(confidentiality='operational' or public.crm_can(organization_id,confidentiality||'.update','project',project_id));
-- No authenticated storage policy exists for project-files in the audited baseline.
-- Add a restrictive gate in case future broad storage policies are introduced.
create policy crm_project_storage_gate on storage.objects as restrictive for select to authenticated using(bucket_id<>'project-files' or exists(select 1 from public.project_documents d where d.storage_path=name and public.is_org_member(d.organization_id)));

-- Never grant table-wide privileges on new exposed relations.
revoke all on public.crm_access_grants,public.crm_audit_log,public.project_manager_history,public.project_contract_links from anon,authenticated;
grant select,insert,update on public.crm_access_grants to authenticated;
grant select on public.crm_audit_log,public.project_manager_history to authenticated;
grant select,insert,delete on public.project_contract_links to authenticated;
grant all on public.crm_access_grants,public.crm_audit_log,public.project_manager_history,public.project_contract_links to service_role;
-- Exact grants for existing tables remove TRUNCATE/REFERENCES/TRIGGER default privileges.
revoke all on public.crm_accounts,public.crm_contacts,public.crm_opportunities,public.crm_activities,public.project_contracts,public.finance_invoices,public.finance_invoice_lines,public.finance_transactions,public.finance_budgets from anon,authenticated;
grant select,insert,update on public.crm_accounts,public.crm_contacts,public.crm_opportunities,public.crm_activities,public.project_contracts,public.finance_invoices,public.finance_invoice_lines,public.finance_transactions,public.finance_budgets to authenticated;
-- Explicit project permissions supplement the existing owner-write policy.
create policy crm_project_update on public.projects for update to authenticated
using(public.crm_can(organization_id,'project.update','project',id) or public.crm_can(organization_id,'project.assign_manager','project',id))
with check(public.crm_can(organization_id,'project.update','project',id) or public.crm_can(organization_id,'project.assign_manager','project',id));

alter table public.project_context_documents add column confidentiality text not null default 'operational' check(confidentiality in ('operational','contract','finance'));
alter table public.project_document_chunks add column confidentiality text not null default 'operational' check(confidentiality in ('operational','contract','finance'));
update public.project_document_chunks c set confidentiality=d.confidentiality from public.project_documents d where d.id=c.document_id and d.confidentiality<>'operational';
update public.project_context_documents c set confidentiality=d.confidentiality from public.project_documents d where c.id=d.context_document_id and d.confidentiality<>'operational';
-- Historical analyses might already contain legal terms: quarantine affected project analyses.
update public.project_context_documents c set confidentiality='contract' where exists(select 1 from public.project_documents d where d.project_id=c.project_id and d.confidentiality<>'operational') and c.context_type='project_analysis';
create policy crm_context_confidentiality on public.project_context_documents as restrictive for select to authenticated using(confidentiality='operational');
create policy crm_chunks_confidentiality on public.project_document_chunks as restrictive for select to authenticated using(confidentiality='operational');

create function crm_private.contact_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.account_id is null then raise exception 'A contact requires a customer';end if;
 perform 1 from public.crm_accounts where id=new.account_id and organization_id=new.organization_id for update;
 if not found then raise exception 'Customer unavailable';end if;
 if new.owner_user_id is not null and not exists(select 1 from public.organization_members where organization_id=new.organization_id and user_id=new.owner_user_id and membership_status='active') then raise exception 'Invalid contact owner';end if;
 if new.is_primary then update public.crm_contacts set is_primary=false where account_id=new.account_id and organization_id=new.organization_id and id<>new.id and is_primary;end if;
 return new;
end $$;
revoke all on function crm_private.contact_guard() from public,anon,authenticated;
create trigger crm_contact_guard before insert or update on public.crm_contacts for each row execute function crm_private.contact_guard();

create function crm_private.customer_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE' and new.organization_id<>old.organization_id then raise exception 'Customer company cannot be changed';end if;
 if new.owner_user_id is not null and not exists(select 1 from public.organization_members where organization_id=new.organization_id and user_id=new.owner_user_id and membership_status='active') then raise exception 'Invalid customer owner';end if;
 if new.owner_agent_id is not null and not exists(select 1 from public.agents where organization_id=new.organization_id and id=new.owner_agent_id and enabled) then raise exception 'Invalid account agent';end if;
 if new.customer_status='archived' and (tg_op='INSERT' or old.customer_status<>'archived') and not crm_private.can_access(new.organization_id,'customer.archive','customer',new.id) then raise exception 'Archive permission required';end if;
 return new;
end $$;
revoke all on function crm_private.customer_guard() from public,anon,authenticated;
create trigger crm_customer_guard before insert or update on public.crm_accounts for each row execute function crm_private.customer_guard();

-- Service-only controlled retrieval: both principals must authorize the exact data domain.
create function public.crm_agent_customer_context(p_organization_id uuid,p_customer_id uuid,p_agent_id uuid,p_user_id uuid default null,p_include_contracts boolean default false,p_include_finance boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if not exists(select 1 from public.agents where id=p_agent_id and organization_id=p_organization_id and enabled) then raise exception 'Agent unavailable';end if;
 if not crm_private.has_capability(p_organization_id,'customer.read','customer',p_customer_id,'agent',p_agent_id) or
 (p_user_id is not null and not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=p_user_id and membership_status='active')) then raise exception 'Customer authorization required';end if;
 select jsonb_build_object('id',id,'name',name,'status',customer_status,'industry',industry,'preferred_language',preferred_language) into result from public.crm_accounts where id=p_customer_id and organization_id=p_organization_id;
 if result is null then raise exception 'Customer unavailable';end if;
 if p_include_contracts then
  if not crm_private.has_capability(p_organization_id,'contract.read','customer',p_customer_id,'agent',p_agent_id) or (p_user_id is not null and not crm_private.has_capability(p_organization_id,'contract.read','customer',p_customer_id,'user',p_user_id)) then raise exception 'Contract authorization required';end if;
  result:=result||jsonb_build_object('contracts',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'identifier',contract_number,'status',contract_status,'scope',scope_description)),'[]') from public.project_contracts where organization_id=p_organization_id and customer_id=p_customer_id));
 end if;
 if p_include_finance then
  if not crm_private.has_capability(p_organization_id,'finance.read','customer',p_customer_id,'agent',p_agent_id) or (p_user_id is not null and not crm_private.has_capability(p_organization_id,'finance.read','customer',p_customer_id,'user',p_user_id)) then raise exception 'Finance authorization required';end if;
  result:=result||jsonb_build_object('invoices',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'currency',currency,'total',total,'amount_paid',amount_paid,'status',status)),'[]') from public.finance_invoices where organization_id=p_organization_id and customer_id=p_customer_id));
 end if;
 return result;
end $$;
revoke all on function public.crm_agent_customer_context(uuid,uuid,uuid,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.crm_agent_customer_context(uuid,uuid,uuid,uuid,boolean,boolean) to service_role;

-- Partial cash receipts use the existing ledger, serialized against the invoice row.
create unique index crm_payment_idempotency on public.finance_transactions(organization_id,external_reference) where source_type='crm_payment';
create function public.crm_record_invoice_payment(p_invoice_id uuid,p_amount numeric default null,p_idempotency_key text default null) returns void
language plpgsql security invoker set search_path='' as $$
declare inv public.finance_invoices; amount numeric;begin
 if p_idempotency_key is null or length(p_idempotency_key)<8 or length(p_idempotency_key)>200 then raise exception 'Payment idempotency key required';end if;
 select * into inv from public.finance_invoices where id=p_invoice_id for update;
 if inv.id is null or not public.crm_can(inv.organization_id,'finance.update','customer',coalesce(inv.customer_id,inv.organization_id)) or not public.crm_can(inv.organization_id,'finance.create','customer',coalesce(inv.customer_id,inv.organization_id)) then raise exception 'Explicit payment authorization required';end if;
 if exists(select 1 from public.finance_transactions where organization_id=inv.organization_id and source_type='crm_payment' and external_reference=p_idempotency_key and invoice_id=p_invoice_id) then return;end if;
 if inv.status not in ('issued','overdue') then raise exception 'Only issued invoices accept payments';end if;
 amount:=coalesce(p_amount,inv.total-inv.amount_paid);
 if amount<=0 or amount<>round(amount,2) or amount>inv.total-inv.amount_paid then raise exception 'Invalid payment amount';end if;
 insert into public.finance_transactions(organization_id,customer_id,project_id,contract_id,invoice_id,transaction_type,status,category,description,amount,currency,source_type,source_id,external_reference,created_by_user_id)
 values(inv.organization_id,inv.customer_id,inv.project_id,inv.contract_id,inv.id,'revenue','posted','invoice','Customer invoice payment',amount,inv.currency,'crm_payment',inv.id,p_idempotency_key,auth.uid());
 update public.finance_invoices set amount_paid=amount_paid+amount,status=case when amount_paid+amount=total then 'paid' else status end,paid_at=case when amount_paid+amount=total then now() else null end,updated_at=now() where id=inv.id;
end $$;
revoke all on function public.crm_record_invoice_payment(uuid,numeric,text) from public,anon;
grant execute on function public.crm_record_invoice_payment(uuid,numeric,text) to authenticated;

create function crm_private.notify_manager() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' then
  insert into public.project_manager_history(organization_id,project_id,new_manager_user_id,actor_user_id,reason) values(new.organization_id,new.id,new.primary_manager_user_id,auth.uid(),'Project creation');
 end if;
 if tg_op='INSERT' or new.primary_manager_user_id is distinct from old.primary_manager_user_id then
  insert into public.notifications(organization_id,user_id,category,severity,title,body,action_url,source_type,source_id)
  values(new.organization_id,new.primary_manager_user_id,'project','info','Project responsibility assigned','You are the primary accountable manager.','/projects/operating?project='||new.id,'project',new.id);
  if tg_op='UPDATE' and old.primary_manager_user_id is not null then
   insert into public.notifications(organization_id,user_id,category,severity,title,body,action_url,source_type,source_id) values(new.organization_id,old.primary_manager_user_id,'project','info','Project responsibility reassigned','The project now has a different primary manager.','/projects/operating?project='||new.id,'project',new.id);
  end if;
 end if;return new;
end $$;
revoke all on function crm_private.notify_manager() from public,anon,authenticated;
create trigger crm_manager_notifications after insert or update of primary_manager_user_id on public.projects for each row execute function crm_private.notify_manager();

create function crm_private.membership_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if (tg_op='DELETE' or new.membership_status<>'active') and exists(select 1 from public.projects p where p.organization_id=old.organization_id and p.primary_manager_user_id=old.user_id and lower(p.status) not in ('completed','cancelled','archived','failed')) then raise exception 'Reassign active projects before removing their manager';end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function crm_private.membership_guard() from public,anon,authenticated;
create trigger crm_membership_guard before update of membership_status or delete on public.organization_members for each row execute function crm_private.membership_guard();

alter table public.crm_opportunities add constraint crm_opportunities_org_id unique(organization_id,id);
alter table public.crm_activities add constraint crm_activity_contact_tenant foreign key(organization_id,contact_id) references public.crm_contacts(organization_id,id) not valid,
 add constraint crm_activity_opportunity_tenant foreign key(organization_id,opportunity_id) references public.crm_opportunities(organization_id,id) not valid;
create function crm_private.opportunity_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.account_id is null then raise exception 'An opportunity requires a customer';end if;
 if new.primary_contact_id is not null and not exists(select 1 from public.crm_contacts c where c.organization_id=new.organization_id and c.id=new.primary_contact_id and c.account_id=new.account_id) then raise exception 'Opportunity contact must belong to its customer';end if;
 if new.owner_user_id is not null and not exists(select 1 from public.organization_members where organization_id=new.organization_id and user_id=new.owner_user_id and membership_status='active') then raise exception 'Invalid opportunity owner';end if;
 return new;
end $$;
revoke all on function crm_private.opportunity_guard() from public,anon,authenticated;
create trigger crm_opportunity_guard before insert or update on public.crm_opportunities for each row execute function crm_private.opportunity_guard();

alter table public.crm_audit_log add column customer_id uuid;
create or replace function crm_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end; vis text:=tg_argv[0]; cid uuid;
begin
 cid:=case when tg_table_name='crm_accounts' then (row_data->>'id')::uuid else coalesce((row_data->>'account_id')::uuid,(row_data->>'customer_id')::uuid) end;
 insert into public.crm_audit_log(organization_id,actor_user_id,event_type,resource_type,resource_id,customer_id,visibility,detail)
 values((row_data->>'organization_id')::uuid,auth.uid(),lower(tg_op),tg_table_name,(row_data->>'id')::uuid,cid,vis,'{}');
 return case when tg_op='DELETE' then old else new end;
end $$;
create index crm_audit_customer on public.crm_audit_log(organization_id,customer_id,created_at desc);
create trigger crm_project_audit after insert or update of status,customer_id,primary_manager_user_id on public.projects for each row execute function crm_private.audit_change('operational');
create policy crm_audit_resource_read on public.crm_audit_log for select to authenticated using(visibility in ('contract','finance') and public.crm_can(organization_id,visibility||'.read','customer',coalesce(customer_id,organization_id)));

-- Removing financial content from a record's classification must never expose an old secret.
create function crm_private.activity_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE' and old.visibility<>'operational' and old.visibility<>new.visibility then raise exception 'Confidential activity cannot be downgraded';end if;
 if new.opportunity_id is not null or new.activity_type in ('proposal','stage_change') then new.visibility:='finance';end if;
 return new;
end $$;
revoke all on function crm_private.activity_guard() from public,anon,authenticated;
create trigger crm_activity_guard before insert or update on public.crm_activities for each row execute function crm_private.activity_guard();

alter table public.project_documents alter column project_id drop not null;
alter table public.project_documents add column customer_id uuid,add column contract_id uuid,
 add constraint document_customer_tenant foreign key(organization_id,customer_id) references public.crm_accounts(organization_id,id),
 add constraint document_contract_tenant foreign key(organization_id,contract_id) references public.project_contracts(organization_id,id);
create index crm_contract_documents on public.project_documents(organization_id,contract_id);
drop policy crm_documents_confidentiality on public.project_documents;
create policy crm_documents_confidentiality on public.project_documents as restrictive for all to authenticated
 using(confidentiality='operational' or public.crm_can(organization_id,confidentiality||'.read',case when contract_id is not null then 'contract' else 'project' end,coalesce(contract_id,project_id)))
 with check(confidentiality='operational' or public.crm_can(organization_id,confidentiality||'.update',case when contract_id is not null then 'contract' else 'project' end,coalesce(contract_id,project_id)));
create function crm_private.document_relationship_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.project_id is null and new.contract_id is null then raise exception 'Document requires a project or contract';end if;
 if new.contract_id is not null then
  if not exists(select 1 from public.project_contracts c where c.id=new.contract_id and c.organization_id=new.organization_id and c.customer_id=new.customer_id) then raise exception 'Document customer mismatch';end if;
  new.confidentiality:='contract';new.legal_document:=true;
 end if;
 return new;
end $$;
revoke all on function crm_private.document_relationship_guard() from public,anon,authenticated;
create trigger crm_document_relationship_guard before insert or update on public.project_documents for each row execute function crm_private.document_relationship_guard();
update storage.buckets set public=false where id='project-files';

-- The project execution cap is financial data too. Keep engine service access, expose user
-- reads only through an exact finance.read check; SELECT * must not leak it via the Data API.
do $$declare cols text;begin
 select string_agg(quote_ident(column_name),',' order by ordinal_position) into cols from information_schema.columns where table_schema='public' and table_name='projects' and column_name<>'budget_cap_usd';
 revoke select on public.projects from authenticated;
 execute 'grant select ('||cols||') on public.projects to authenticated';
end $$;
create function crm_private.project_budget(org uuid,pid uuid) returns numeric language plpgsql stable security definer set search_path='' as $$declare result numeric;begin
 if not crm_private.can_access(org,'finance.read','project',pid) then raise exception 'Explicit financial authorization required';end if;
 select budget_cap_usd into result from public.projects where id=pid and organization_id=org;return result;
end $$;
revoke all on function crm_private.project_budget(uuid,uuid) from public,anon;
grant execute on function crm_private.project_budget(uuid,uuid) to authenticated;
create function public.crm_project_budget(p_organization_id uuid,p_project_id uuid) returns numeric language sql stable security invoker set search_path='' as $$select crm_private.project_budget(p_organization_id,p_project_id)$$;
revoke all on function public.crm_project_budget(uuid,uuid) from public,anon;
grant execute on function public.crm_project_budget(uuid,uuid) to authenticated;
create function crm_private.budget_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is not null and ((tg_op='INSERT' and new.budget_cap_usd is not null) or (tg_op='UPDATE' and new.budget_cap_usd is distinct from old.budget_cap_usd)) and not crm_private.can_access(new.organization_id,'finance.update','project',new.id) then raise exception 'Explicit budget authorization required';end if;return new;
end $$;
revoke all on function crm_private.budget_guard() from public,anon,authenticated;
create trigger crm_budget_guard before insert or update of budget_cap_usd on public.projects for each row execute function crm_private.budget_guard();
create policy crm_finance_audit_gate on public.audit_events as restrictive for select to authenticated using(
 case when event_type like 'finance.%' then public.crm_can(organization_id,'finance.read') when event_type like 'contract.%' then public.crm_can(organization_id,'contract.read') else true end);

create function crm_private.contract_link_origin() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.project_id is not null then insert into public.project_contract_links(organization_id,project_id,contract_id) values(new.organization_id,new.project_id,new.id) on conflict do nothing;end if;return new;
end $$;
revoke all on function crm_private.contract_link_origin() from public,anon,authenticated;
create trigger crm_contract_link_origin after insert on public.project_contracts for each row execute function crm_private.contract_link_origin();

-- Source classification follows the record into every persistent retrieval derivative.
create function crm_private.derivative_guard() returns trigger language plpgsql security definer set search_path='' as $$declare doc uuid;classification text;begin
 if tg_table_name='project_document_chunks' then doc:=new.document_id;
 else doc:=case when coalesce(new.evidence->>'project_document_id','') ~ '^[0-9a-f-]{36}$' then (new.evidence->>'project_document_id')::uuid else null end;end if;
 if doc is not null then
  select confidentiality into classification from public.project_documents where id=doc and organization_id=new.organization_id;
  if classification is null then raise exception 'Source document unavailable';end if;
  new.confidentiality:=classification;
 end if;return new;
end $$;
revoke all on function crm_private.derivative_guard() from public,anon,authenticated;
create trigger crm_chunk_classification before insert or update on public.project_document_chunks for each row execute function crm_private.derivative_guard();
create trigger crm_context_classification before insert or update on public.project_context_documents for each row execute function crm_private.derivative_guard();

create function public.crm_create_invoice_draft(p_organization_id uuid,p_customer_id uuid,p_project_id uuid,p_contract_id uuid,p_customer_name text,p_customer_email text,p_description text,p_quantity numeric,p_unit_price numeric,p_tax_rate numeric,p_currency text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare iid uuid;subtotal numeric;tax numeric;begin
 if not public.crm_can(p_organization_id,'finance.create','customer',coalesce(p_customer_id,p_organization_id)) then raise exception 'Explicit invoice authorization required';end if;
 if p_quantity<=0 or p_unit_price<0 or p_tax_rate<0 or p_currency !~ '^[A-Z]{3}$' or length(trim(p_description))=0 then raise exception 'Invalid invoice values';end if;
 subtotal:=round(p_quantity*p_unit_price,2);tax:=round(subtotal*p_tax_rate/100,2);
 insert into public.finance_invoices(organization_id,customer_id,project_id,contract_id,internal_reference,direction,status,customer_name,customer_email,currency,subtotal,tax_total,total,created_by_user_id,source_type)
 values(p_organization_id,p_customer_id,p_project_id,p_contract_id,'RF-'||gen_random_uuid(),'receivable','draft',p_customer_name,p_customer_email,p_currency,subtotal,tax,subtotal+tax,auth.uid(),'manual') returning id into iid;
 insert into public.finance_invoice_lines(organization_id,invoice_id,description,quantity,unit_price,tax_rate,line_subtotal,line_tax,line_total,source_type)
 values(p_organization_id,iid,p_description,p_quantity,p_unit_price,p_tax_rate,subtotal,tax,subtotal+tax,'manual');
 return iid;
end $$;
revoke all on function public.crm_create_invoice_draft(uuid,uuid,uuid,uuid,text,text,text,numeric,numeric,numeric,text) from public,anon;
grant execute on function public.crm_create_invoice_draft(uuid,uuid,uuid,uuid,text,text,text,numeric,numeric,numeric,text) to authenticated;

create policy crm_project_create on public.projects for insert to authenticated with check(public.crm_can(organization_id,'project.create'));
create function public.crm_reconcile_project(p_project_id uuid,p_manager_id uuid,p_engagement_type text,p_customer_id uuid,p_reason text default null) returns void language plpgsql security invoker set search_path='' as $$declare org uuid;begin
 select organization_id into org from public.projects where id=p_project_id for update;
 if org is null or not public.crm_can(org,'project.assign_manager','project',p_project_id) or not public.crm_can(org,'project.update','project',p_project_id) then raise exception 'Explicit reconciliation permission required';end if;
 perform set_config('rythm.manager_reason',left(coalesce(p_reason,'Legacy reconciliation'),1000),true);
 update public.projects set primary_manager_user_id=p_manager_id,engagement_type=p_engagement_type,customer_id=p_customer_id,crm_reconciliation_required=false where id=p_project_id and organization_id=org;
end $$;
revoke all on function public.crm_reconcile_project(uuid,uuid,text,uuid,text) from public,anon;
grant execute on function public.crm_reconcile_project(uuid,uuid,text,uuid,text) to authenticated;

alter table public.projects add constraint crm_project_accountability_check check(crm_reconciliation_required or (primary_manager_user_id is not null and ((engagement_type='internal' and customer_id is null) or (engagement_type='external' and customer_id is not null))));
commit;
