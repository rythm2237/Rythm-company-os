begin;
-- One customer identity; invoice party fields are legal snapshots, not another CRM.
create function crm_private.invoice_customer_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.crm_accounts;begin
 if tg_op='UPDATE' and old.status not in ('draft','failed') and (new.customer_id,new.project_id,new.contract_id,new.customer_name,new.customer_email) is distinct from (old.customer_id,old.project_id,old.contract_id,old.customer_name,old.customer_email) then raise exception 'Issued invoice identity and relationships are historical records';end if;
 if new.customer_id is not null and (tg_op='INSERT' or old.status in ('draft','failed') or new.customer_id is distinct from old.customer_id) then
  select * into c from public.crm_accounts where id=new.customer_id and organization_id=new.organization_id;
  if c.id is null then raise exception 'Customer unavailable';end if;
  new.customer_name:=coalesce(nullif(c.legal_name,''),c.name);
  new.customer_email:=coalesce(nullif(c.billing_email,''),c.email);
 end if;return new;
end $$;
revoke all on function crm_private.invoice_customer_snapshot() from public,anon,authenticated;
create trigger crm_invoice_customer_snapshot before insert or update on public.finance_invoices for each row execute function crm_private.invoice_customer_snapshot();

-- Financial links must agree with an attached invoice, including direct API writes.
create function crm_private.payment_relationship_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare i public.finance_invoices;begin
 if new.invoice_id is not null then
  select * into i from public.finance_invoices where id=new.invoice_id and organization_id=new.organization_id;
  if i.id is null or (new.customer_id,new.project_id,new.contract_id) is distinct from (i.customer_id,i.project_id,i.contract_id) then raise exception 'Payment must use its invoice relationships';end if;
 end if;return new;
end $$;
revoke all on function crm_private.payment_relationship_guard() from public,anon,authenticated;
create trigger crm_payment_relationship_guard before insert or update on public.finance_transactions for each row execute function crm_private.payment_relationship_guard();

-- Atomically create the existing project and its existing/new contract relationship.
-- Identifiers below are validated allowlists; record values remain SQL parameters.
create function public.crm_create_linked_project(p_organization_id uuid,p_project jsonb,p_contract_id uuid default null,p_new_contract jsonb default null) returns uuid
language plpgsql security invoker set search_path='' as $$
declare pid uuid;cid uuid;cols text;values_sql text;begin
 if not public.crm_can(p_organization_id,'project.create') then raise exception 'Project creation authorization required';end if;
 if jsonb_typeof(p_project) is distinct from 'object' or octet_length(p_project::text)>64000 or not p_project ? 'name' then raise exception 'Invalid project input';end if;
 if exists(select 1 from jsonb_object_keys(p_project) k where k not in ('project_code','name','description','primary_manager_user_id','customer_id','engagement_type','project_type','status','stage','priority','owner_type','objective','scope','success_criteria','constraints','progress_percent','start_date','target_date','internal_owner_label','responsible_department','tags','notes','autonomy_mode','readiness_score')) then raise exception 'Unsupported project fields';end if;
 cid:=(p_project->>'customer_id')::uuid;
 if p_contract_id is not null then
  if p_new_contract is not null or not public.crm_can(p_organization_id,'contract.update','contract',p_contract_id) or not exists(select 1 from public.project_contracts where id=p_contract_id and organization_id=p_organization_id and customer_id=cid) then raise exception 'Select a permitted contract for the same customer';end if;
 end if;
 select string_agg(quote_ident(k),',' order by k),string_agg('r.'||quote_ident(k),',' order by k) into cols,values_sql from jsonb_object_keys(p_project) k;
 execute format('insert into public.projects(organization_id,created_by_user_id,%s) select $1,auth.uid(),%s from jsonb_populate_record(null::public.projects,$2) r returning id',cols,values_sql) into pid using p_organization_id,p_project;
 if p_contract_id is not null then
  insert into public.project_contract_links(organization_id,project_id,contract_id) values(p_organization_id,pid,p_contract_id);
 end if;
 if p_new_contract is not null then
  if cid is null or jsonb_typeof(p_new_contract)<>'object' or octet_length(p_new_contract::text)>64000 or not public.crm_can(p_organization_id,'contract.create','customer',cid) then raise exception 'Contract creation authorization required';end if;
  if exists(select 1 from jsonb_object_keys(p_new_contract) k where k not in ('contract_number','contract_start_date','contract_end_date','contract_value','currency','payment_terms','deliverables','sla','milestones','provider_obligations','client_obligations','exclusions','dependencies','approval_requirements','termination_conditions','confidentiality_requirements','ip_ownership','data_protection_requirements','special_clauses','notes')) then raise exception 'Unsupported contract fields';end if;
  if p_new_contract->>'contract_value' is not null and ((p_new_contract->>'contract_value')::numeric < 0 or (p_new_contract->>'contract_value')::numeric::text in ('NaN','Infinity','-Infinity')) then raise exception 'Contract value must be finite and nonnegative';end if;
  if p_new_contract->>'currency' is not null and p_new_contract->>'currency' !~ '^[A-Z]{3}$' then raise exception 'Invalid currency';end if;
  if (p_new_contract->>'contract_end_date')::date < (p_new_contract->>'contract_start_date')::date then raise exception 'Invalid contract date range';end if;
  select string_agg(quote_ident(k),',' order by k),string_agg('r.'||quote_ident(k),',' order by k) into cols,values_sql from jsonb_object_keys(p_new_contract) k;
  if cols is null then raise exception 'Contract fields required';end if;
  execute format('insert into public.project_contracts(organization_id,project_id,customer_id,%s) select $1,$2,$3,%s from jsonb_populate_record(null::public.project_contracts,$4) r',cols,values_sql) using p_organization_id,pid,cid,p_new_contract;
 end if;
 return pid;
end $$;
revoke all on function public.crm_create_linked_project(uuid,jsonb,uuid,jsonb) from public,anon;
grant execute on function public.crm_create_linked_project(uuid,jsonb,uuid,jsonb) to authenticated;

-- Suggestions stay inside the protected contract row until a human selects fields.
alter table public.project_contracts add column profile_suggestion jsonb;
create function crm_private.profile_suggestion_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare proposal jsonb:=new.profile_suggestion;begin
 if proposal is null then return new;end if;
 if jsonb_typeof(proposal)<>'object' or octet_length(proposal::text)>16000 or jsonb_typeof(proposal->'fields') is distinct from 'object' then raise exception 'Invalid profile suggestion';end if;
 if exists(select 1 from jsonb_each(proposal->'fields') p where p.key not in ('name','legal_name','registration_number','vat_number','email','phone','address','billing_address','country_code','website_url') or jsonb_typeof(p.value)<>'string' or length(p.value#>>'{}')>1000) then raise exception 'Only customer identity fields may be suggested';end if;
 if not exists(select 1 from public.project_documents d where d.id=(proposal->>'document_id')::uuid and d.organization_id=new.organization_id and d.contract_id=new.id) then raise exception 'Suggestion source must belong to the contract';end if;
 return new;
end $$;
revoke all on function crm_private.profile_suggestion_guard() from public,anon,authenticated;
create trigger crm_profile_suggestion_guard before insert or update of profile_suggestion on public.project_contracts for each row execute function crm_private.profile_suggestion_guard();

create function public.crm_apply_contract_profile(p_contract_id uuid,p_fields text[],p_expected_customer_updated_at timestamptz,p_expected_suggestion_hash text) returns void
language plpgsql security invoker set search_path='' as $$
declare contract public.project_contracts;c public.crm_accounts;merged public.crm_accounts;chosen jsonb;begin
 select * into contract from public.project_contracts where id=p_contract_id for update;
 if contract.id is null or not public.crm_can(contract.organization_id,'contract.read','contract',contract.id) or not public.crm_can(contract.organization_id,'contract.update','contract',contract.id) or not public.crm_can(contract.organization_id,'customer.update','customer',contract.customer_id) then raise exception 'Explicit contract and profile permissions required';end if;
 select * into c from public.crm_accounts where id=contract.customer_id and organization_id=contract.organization_id for update;
 if c.id is null or c.updated_at is distinct from p_expected_customer_updated_at then raise exception 'Customer profile changed. Refresh and review again.';end if;
 if contract.profile_suggestion->>'sha256' is distinct from p_expected_suggestion_hash then raise exception 'Proposal changed. Refresh and review again.';end if;
 if coalesce(cardinality(p_fields),0) not between 1 and 10 or contract.profile_suggestion is null then raise exception 'Select proposed fields to apply';end if;
 if exists(select 1 from unnest(p_fields) k where k not in ('name','legal_name','registration_number','vat_number','email','phone','address','billing_address','country_code','website_url') or not (contract.profile_suggestion->'fields') ? k) then raise exception 'Unsupported profile field';end if;
 select jsonb_object_agg(k,contract.profile_suggestion->'fields'->k) into chosen from unnest(p_fields) k;
 select * into merged from jsonb_populate_record(c,chosen);
 update public.crm_accounts set name=merged.name,legal_name=merged.legal_name,registration_number=merged.registration_number,vat_number=merged.vat_number,email=merged.email,phone=merged.phone,address=merged.address,billing_address=merged.billing_address,country_code=merged.country_code,website_url=merged.website_url,updated_at=clock_timestamp() where id=c.id;
 update public.project_contracts set profile_suggestion=null where id=contract.id;
end $$;
revoke all on function public.crm_apply_contract_profile(uuid,text[],timestamptz,text) from public,anon;
grant execute on function public.crm_apply_contract_profile(uuid,text[],timestamptz,text) to authenticated;
create or replace function crm_private.relationship_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.project_id is not null and not exists(select 1 from public.projects where id=new.project_id and organization_id=new.organization_id and customer_id is not distinct from new.customer_id) then raise exception 'Project customer mismatch';end if;
 if new.contract_id is not null and not exists(select 1 from public.project_contracts where id=new.contract_id and organization_id=new.organization_id and customer_id is not distinct from new.customer_id) then raise exception 'Contract customer mismatch';end if;
 if new.project_id is not null and new.contract_id is not null and not exists(select 1 from public.project_contract_links where organization_id=new.organization_id and project_id=new.project_id and contract_id=new.contract_id) then raise exception 'The selected contract is not linked to this project';end if;
 return new;
end $$;
create or replace function crm_private.document_relationship_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid;linked uuid[];begin
 if new.project_id is null and new.contract_id is null then raise exception 'Document requires a project or contract';end if;
 if new.project_id is not null then
  select customer_id into cid from public.projects where id=new.project_id and organization_id=new.organization_id;
  if not found then raise exception 'Document project unavailable';end if;
  if new.customer_id is not null and new.customer_id is distinct from cid then raise exception 'Document customer mismatch';end if;
  new.customer_id:=cid;
  if new.contract_id is null and new.category in ('contract','amendment','nda','statement_of_work') then
   select array_agg(contract_id) into linked from public.project_contract_links where project_id=new.project_id and organization_id=new.organization_id;
   if cardinality(linked)=1 then new.contract_id:=linked[1];end if;
  end if;
 end if;
 if new.contract_id is not null then
  select customer_id into cid from public.project_contracts where id=new.contract_id and organization_id=new.organization_id;
  if not found or (new.customer_id is not null and new.customer_id is distinct from cid) then raise exception 'Document customer mismatch';end if;
  new.customer_id:=cid;new.confidentiality:='contract';new.legal_document:=true;
  if new.project_id is not null and not exists(select 1 from public.project_contract_links where project_id=new.project_id and contract_id=new.contract_id and organization_id=new.organization_id) then raise exception 'Document contract is not linked to the project';end if;
 end if;return new;
end $$;
create function crm_private.project_document_customer() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.customer_id is distinct from old.customer_id then
  update public.project_documents set customer_id=new.customer_id where project_id=new.id and organization_id=new.organization_id and contract_id is null;
 end if;return new;
end $$;
revoke all on function crm_private.project_document_customer() from public,anon,authenticated;
create trigger crm_project_document_customer after update of customer_id on public.projects for each row execute function crm_private.project_document_customer();
update public.project_documents d set customer_id=p.customer_id from public.projects p where p.id=d.project_id and p.organization_id=d.organization_id and d.customer_id is null and p.customer_id is not null;
commit;
