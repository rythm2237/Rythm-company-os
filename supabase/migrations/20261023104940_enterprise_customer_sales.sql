-- Independently implemented native CRM. No EspoCRM code or metadata incorporated.
begin;
alter table public.crm_accounts add column email text, add column billing_address text,
 add column region text, add column custom_fields jsonb not null default '{}',
 add constraint crm_custom_fields_object check(jsonb_typeof(custom_fields)='object' and octet_length(custom_fields::text)<=8192);
create index crm_customer_email_lookup on public.crm_accounts(organization_id,lower(btrim(email))) where email is not null;
create index crm_customer_registration_lookup on public.crm_accounts(organization_id,lower(btrim(registration_number))) where registration_number is not null;
create index crm_customer_name_lookup on public.crm_accounts(organization_id,lower(btrim(name)));
create table public.crm_preferences (
 organization_id uuid primary key references public.organizations(id),
 duplicate_name boolean not null default true, duplicate_email boolean not null default true,
 duplicate_registration boolean not null default true
);
alter table public.crm_preferences enable row level security;
create policy crm_preferences_read on public.crm_preferences for select to authenticated using(public.is_org_member(organization_id));
create policy crm_preferences_create on public.crm_preferences for insert to authenticated with check(public.is_org_owner(organization_id));
create policy crm_preferences_update on public.crm_preferences for update to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));
revoke all on public.crm_preferences from public,anon,authenticated;
grant select,insert,update on public.crm_preferences to authenticated;
grant all on public.crm_preferences to service_role;

create function crm_private.customer_identity_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare prefs public.crm_preferences;begin
 new.name:=btrim(new.name);new.email:=nullif(lower(btrim(new.email)),'');
 if (select count(*) from jsonb_object_keys(new.custom_fields))>40 or exists(select 1 from jsonb_each(new.custom_fields) p where length(p.key)>80 or jsonb_typeof(p.value) not in ('string','number','boolean','null') or (jsonb_typeof(p.value)='string' and length(p.value#>>'{}')>1000)) then raise exception 'Use up to 40 simple operational custom properties';end if;
 if length(new.name) not between 1 and 240 or length(coalesce(new.email,''))>320 or
 (new.email is not null and new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid customer identity';end if;
 if tg_op='UPDATE' and (new.name,new.email,new.registration_number) is not distinct from (old.name,old.email,old.registration_number) then return new;end if;
 -- Serialize competing writes within a tenant; guards also run on direct Data API writes.
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text,0));
 select * into prefs from public.crm_preferences where organization_id=new.organization_id;
 if exists(select 1 from public.crm_accounts a where a.organization_id=new.organization_id and a.id<>new.id and (
  (coalesce(prefs.duplicate_name,true) and lower(btrim(a.name))=lower(new.name)) or
  (coalesce(prefs.duplicate_email,true) and new.email is not null and lower(btrim(a.email))=new.email) or
  (coalesce(prefs.duplicate_registration,true) and nullif(btrim(new.registration_number),'') is not null and lower(btrim(a.registration_number))=lower(btrim(new.registration_number)))
 )) then raise exception using errcode='23505',message='A customer with matching identity already exists. Select the existing customer or review duplicate settings.';end if;
 return new;
end $$;
revoke all on function crm_private.customer_identity_guard() from public,anon,authenticated;
create trigger crm_customer_identity_guard before insert or update on public.crm_accounts for each row execute function crm_private.customer_identity_guard();

create table public.crm_leads (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 name text not null check(length(btrim(name)) between 1 and 240), company_name text,
 email text,phone text,source text not null default 'manual',
 status text not null default 'new' check(status in ('new','assigned','qualifying','qualified','converted','disqualified')),
 owner_user_id uuid,next_follow_up_at timestamptz,qualification_notes text,
 converted_customer_id uuid,converted_contact_id uuid,converted_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),foreign key(organization_id,owner_user_id) references public.organization_members(organization_id,user_id),
 foreign key(organization_id,converted_customer_id) references public.crm_accounts(organization_id,id),
 foreign key(organization_id,converted_contact_id) references public.crm_contacts(organization_id,id),
 check((status='converted' and converted_customer_id is not null and converted_contact_id is not null and converted_at is not null) or
       (status<>'converted' and converted_customer_id is null and converted_contact_id is null and converted_at is null))
);
create index crm_leads_status on public.crm_leads(organization_id,status,updated_at desc);
create index crm_leads_follow_up on public.crm_leads(organization_id,owner_user_id,next_follow_up_at);
create index crm_leads_customer on public.crm_leads(organization_id,converted_customer_id);
create index crm_leads_contact on public.crm_leads(organization_id,converted_contact_id);
alter table public.crm_leads enable row level security;
create policy crm_lead_read on public.crm_leads for select to authenticated using(public.crm_can(organization_id,'customer.read'));
create policy crm_lead_create on public.crm_leads for insert to authenticated with check(public.crm_can(organization_id,'customer.create'));
create policy crm_lead_update on public.crm_leads for update to authenticated using(public.crm_can(organization_id,'customer.update')) with check(public.crm_can(organization_id,'customer.update'));
revoke all on public.crm_leads from public,anon,authenticated;
grant select on public.crm_leads to authenticated;
grant insert(organization_id,name,company_name,email,phone,source,status,owner_user_id,next_follow_up_at,qualification_notes),
 update(name,company_name,email,phone,source,status,owner_user_id,next_follow_up_at,qualification_notes) on public.crm_leads to authenticated;
grant all on public.crm_leads to service_role;
create function crm_private.lead_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 new.name:=btrim(new.name);new.email:=nullif(lower(btrim(new.email)),'');
 if length(coalesce(new.email,''))>320 or (new.email is not null and new.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or length(coalesce(new.company_name,''))>240 or length(coalesce(new.phone,''))>100 or length(new.source)>100 or length(coalesce(new.qualification_notes,''))>4000 then raise exception 'Invalid lead fields';end if;
 if tg_op='UPDATE' and old.status='converted' then raise exception 'Converted leads are retained and immutable';end if;
 if new.owner_user_id is not null and not exists(select 1 from public.organization_members where organization_id=new.organization_id and user_id=new.owner_user_id and membership_status='active') then raise exception 'Lead assignee must be an active member';end if;
 new.updated_at:=now();return new;
end $$;
revoke all on function crm_private.lead_guard() from public,anon,authenticated;
create trigger crm_lead_guard before insert or update on public.crm_leads for each row execute function crm_private.lead_guard();
create trigger crm_lead_audit after insert or update on public.crm_leads for each row execute function crm_private.audit_change('operational');

create function crm_private.convert_lead(lid uuid,cid uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.crm_leads; contact_id uuid;begin
 select * into l from public.crm_leads where id=lid for update;
 if l.id is null or not crm_private.can_access(l.organization_id,'customer.update','company',l.organization_id) then raise exception 'Lead conversion unavailable';end if;
 if l.status='converted' then
  if not crm_private.can_access(l.organization_id,'customer.read','customer',l.converted_customer_id) then raise exception 'Customer unavailable';end if;
  return l.converted_customer_id;
 end if;
 if l.status<>'qualified' then raise exception 'Qualify the lead before conversion';end if;
 if cid is null then
  if not crm_private.can_access(l.organization_id,'customer.create','company',l.organization_id) then raise exception 'Customer creation authorization required';end if;
  insert into public.crm_accounts(organization_id,name,account_type,email,phone,source,owner_user_id,customer_status,created_by_user_id)
  values(l.organization_id,coalesce(nullif(btrim(l.company_name),''),l.name),case when nullif(btrim(l.company_name),'') is null then 'individual' else 'company' end,l.email,l.phone,l.source,l.owner_user_id,'prospect',auth.uid()) returning id into cid;
 elsif not crm_private.can_access(l.organization_id,'customer.update','customer',cid) or not exists(select 1 from public.crm_accounts where id=cid and organization_id=l.organization_id) then raise exception 'Customer unavailable';end if;
 if not crm_private.can_access(l.organization_id,'customer.read','customer',cid) then raise exception 'Customer unavailable';end if;
 select id into contact_id from public.crm_contacts where organization_id=l.organization_id and account_id=cid and l.email is not null and lower(email)=lower(l.email) order by created_at limit 1;
 if contact_id is null then
  insert into public.crm_contacts(organization_id,account_id,first_name,email,phone,source,created_by_user_id)
  values(l.organization_id,cid,l.name,l.email,l.phone,l.source,auth.uid()) returning id into contact_id;
 end if;
 update public.crm_leads set status='converted',converted_customer_id=cid,converted_contact_id=contact_id,converted_at=now() where id=lid;
 insert into public.crm_activities(organization_id,account_id,contact_id,subject,activity_type,created_by_user_id)
 values(l.organization_id,cid,contact_id,'Lead converted','note',auth.uid());
 return cid;
end $$;
revoke all on function crm_private.convert_lead(uuid,uuid) from public,anon;
grant execute on function crm_private.convert_lead(uuid,uuid) to authenticated;
create function public.crm_convert_lead(p_lead_id uuid,p_customer_id uuid default null) returns uuid language sql security invoker set search_path='' as $$select crm_private.convert_lead(p_lead_id,p_customer_id)$$;
revoke all on function public.crm_convert_lead(uuid,uuid) from public,anon;
grant execute on function public.crm_convert_lead(uuid,uuid) to authenticated;

-- Reuse the existing single sales pipeline per company; preserve its stage codes.
drop policy crm_stages_member_access on public.crm_pipeline_stages;
create policy crm_stage_read on public.crm_pipeline_stages for select to authenticated using(public.is_org_member(organization_id));
create policy crm_stage_create on public.crm_pipeline_stages for insert to authenticated with check(public.is_org_owner(organization_id));
create policy crm_stage_update on public.crm_pipeline_stages for update to authenticated using(public.is_org_owner(organization_id)) with check(public.is_org_owner(organization_id));
revoke all on public.crm_pipeline_stages from public,anon,authenticated;
grant select,insert,update on public.crm_pipeline_stages to authenticated;
alter table public.crm_pipeline_stages add constraint crm_closed_stage_probability check((not is_won or is_closed) and (not is_closed or probability=case when is_won then 100 else 0 end));
create function crm_private.stage_definition_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE' and (new.organization_id,new.code,new.is_closed,new.is_won) is distinct from (old.organization_id,old.code,old.is_closed,old.is_won) and exists(select 1 from public.crm_opportunities where organization_id=old.organization_id and stage_code=old.code) then raise exception 'Used stage identity and outcome cannot be changed';end if;
 return new;
end $$;
revoke all on function crm_private.stage_definition_guard() from public,anon,authenticated;
create trigger crm_stage_definition_guard before update on public.crm_pipeline_stages for each row execute function crm_private.stage_definition_guard();
alter table public.crm_opportunities add column version integer not null default 1,
 add constraint crm_opportunity_stage_tenant foreign key(organization_id,stage_code) references public.crm_pipeline_stages(organization_id,code) not valid;
create function crm_private.sales_stage_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.crm_pipeline_stages;begin
 if tg_op='UPDATE' and (new.organization_id,new.account_id) is distinct from (old.organization_id,old.account_id) then raise exception 'Opportunity customer cannot be reassigned';end if;
 select * into s from public.crm_pipeline_stages where organization_id=new.organization_id and code=new.stage_code for share;
 if s.id is null then raise exception 'Unknown sales stage';end if;
 if new.currency !~ '^[A-Z]{3}$' then raise exception 'Invalid currency';end if;
 if tg_op='UPDATE' and old.status in ('won','lost','cancelled') and new.stage_code<>old.stage_code and not crm_private.can_access(new.organization_id,'finance.approve','customer',new.account_id) then raise exception 'Reopening a closed opportunity requires finance.approve';end if;
 if tg_op='INSERT' or new.stage_code is distinct from old.stage_code then new.probability:=s.probability;end if;
 new.status:=case when not s.is_closed then 'open' when s.is_won then 'won' else 'lost' end;
 if new.status='lost' and nullif(btrim(new.lost_reason),'') is null then raise exception 'A loss reason is required';end if;
 if tg_op='UPDATE' then new.version:=old.version+1;end if;
 new.updated_at:=now();return new;
end $$;
revoke all on function crm_private.sales_stage_guard() from public,anon,authenticated;
create trigger crm_sales_stage_guard before insert or update on public.crm_opportunities for each row execute function crm_private.sales_stage_guard();
create function public.crm_move_opportunity(p_opportunity_id uuid,p_stage_code text,p_version integer,p_lost_reason text default null) returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.crm_opportunities set stage_code=p_stage_code,lost_reason=nullif(btrim(p_lost_reason),'') where id=p_opportunity_id and version=p_version;
 if not found then raise exception 'Opportunity changed or is unavailable. Refresh and retry.';end if;
end $$;
revoke all on function public.crm_move_opportunity(uuid,text,integer,text) from public,anon;
grant execute on function public.crm_move_opportunity(uuid,text,integer,text) to authenticated;
create function crm_private.sales_stage_history() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' or old.stage_code<>new.stage_code then
  insert into public.crm_activities(organization_id,account_id,opportunity_id,activity_type,visibility,subject,body,created_by_user_id)
  values(new.organization_id,new.account_id,new.id,'stage_change','finance','Sales stage updated',new.stage_code,auth.uid());
 end if;return new;
end $$;
revoke all on function crm_private.sales_stage_history() from public,anon,authenticated;
create trigger crm_sales_stage_history after insert or update on public.crm_opportunities for each row execute function crm_private.sales_stage_history();
create trigger crm_opportunity_audit after insert or update on public.crm_opportunities for each row execute function crm_private.audit_change('finance');

-- Existing tenant bootstrap had only seeded organizations present at migration time.
create function crm_private.seed_sales_stages() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.crm_pipeline_stages(organization_id,code,name,sequence_no,probability,is_closed,is_won)
 select new.id,s.* from (values ('lead','New',10,10,false,false),('qualified','Qualified',20,25,false,false),('proposal','Proposal',30,50,false,false),('negotiation','Negotiation',40,75,false,false),('won','Won',50,100,true,true),('lost','Lost',60,0,true,false)) s(code,name,sequence_no,probability,is_closed,is_won);
 return new;
end $$;
revoke all on function crm_private.seed_sales_stages() from public,anon,authenticated;
create trigger crm_seed_sales_stages after insert on public.organizations for each row execute function crm_private.seed_sales_stages();
insert into public.crm_pipeline_stages(organization_id,code,name,sequence_no,probability,is_closed,is_won)
select o.id,s.* from public.organizations o cross join (values ('lead','New',10,10,false,false),('qualified','Qualified',20,25,false,false),('proposal','Proposal',30,50,false,false),('negotiation','Negotiation',40,75,false,false),('won','Won',50,100,true,true),('lost','Lost',60,0,true,false)) s(code,name,sequence_no,probability,is_closed,is_won)
where not exists(select 1 from public.crm_pipeline_stages where organization_id=o.id);

-- Restrictive gates preserve existing read policies but prevent member-wide forged writes.
create policy crm_activity_write_gate on public.crm_activities as restrictive for insert to authenticated with check(
 created_by_user_id=auth.uid() and created_by_agent_id is null and
 case when visibility='operational' then public.crm_can(organization_id,'customer.update','customer',coalesce(account_id,organization_id)) else public.crm_can(organization_id,visibility||'.create','customer',coalesce(account_id,organization_id)) end);
create policy crm_activity_update_gate on public.crm_activities as restrictive for update to authenticated using(
 public.crm_can(organization_id,case when visibility='operational' then 'customer.update' else visibility||'.update' end,'customer',coalesce(account_id,organization_id))) with check(
 public.crm_can(organization_id,case when visibility='operational' then 'customer.update' else visibility||'.update' end,'customer',coalesce(account_id,organization_id)));

-- Use the existing company event bus. No record IDs, amounts, names or text in payloads.
create function crm_private.lifecycle_event() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.company_events(organization_id,event_type,aggregate_type,actor_type,actor_user_id,payload)
 values(new.organization_id,'crm.'||tg_table_name||'.'||lower(tg_op),'crm',case when auth.uid() is null then 'system' else 'user' end,auth.uid(),'{}');
 if tg_table_name='crm_leads' and new.owner_user_id is not null and (tg_op='INSERT' or new.owner_user_id is distinct from old.owner_user_id) then
  insert into public.notifications(organization_id,user_id,category,severity,title,body,action_url,source_type)
  values(new.organization_id,new.owner_user_id,'project','info','CRM follow-up assigned','Review your assigned lead.','/crm/leads','crm');
 end if;return new;
end $$;
revoke all on function crm_private.lifecycle_event() from public,anon,authenticated;
create trigger crm_lead_event after insert or update on public.crm_leads for each row execute function crm_private.lifecycle_event();
create trigger crm_customer_event after insert on public.crm_accounts for each row execute function crm_private.lifecycle_event();
create trigger crm_opportunity_event after insert or update of stage_code on public.crm_opportunities for each row execute function crm_private.lifecycle_event();

-- Bounded all-or-nothing operational imports; no unrestricted mass assignment.
create function public.crm_import_customers(p_organization_id uuid,p_rows jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare row jsonb; total integer:=0;begin
 if not public.is_org_owner(p_organization_id) or not public.crm_can(p_organization_id,'customer.create') then raise exception 'Owner import authorization required';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 100 then raise exception 'Import 1 to 100 customers per batch';end if;
 for row in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(row)<>'object' or exists(select 1 from jsonb_object_keys(row) k where k not in ('name','email','phone','account_type','industry','source')) then raise exception 'Unsupported import fields';end if;
  insert into public.crm_accounts(organization_id,name,email,phone,account_type,industry,source,created_by_user_id)
  values(p_organization_id,row->>'name',row->>'email',row->>'phone',coalesce(row->>'account_type','company'),row->>'industry',coalesce(row->>'source','import'),auth.uid());
  total:=total+1;
 end loop;return total;
end $$;
revoke all on function public.crm_import_customers(uuid,jsonb) from public,anon;
grant execute on function public.crm_import_customers(uuid,jsonb) to authenticated;
-- Report aggregates run as the caller, so RLS filters before aggregation.
create function public.crm_sales_report(p_organization_id uuid,p_customer_id uuid default null,p_owner_id uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;cid uuid;begin
 select jsonb_build_object('currencies',coalesce((select jsonb_agg(to_jsonb(t)) from (
  select currency,count(*) as opportunities,count(*) filter(where status='won') as won,count(*) filter(where status='lost') as lost,
   coalesce(sum(value) filter(where status='open'),0)::text as open_value,
   coalesce(sum(round(value*probability/100,2)) filter(where status='open'),0)::text as weighted_value,
   coalesce(sum(value) filter(where status='won'),0)::text as won_value
  from public.crm_opportunities where organization_id=p_organization_id and (p_customer_id is null or account_id=p_customer_id) and (p_owner_id is null or owner_user_id=p_owner_id) group by currency order by currency
 )t),'[]'::jsonb),'leads',(select count(*) from public.crm_leads where organization_id=p_organization_id and (p_owner_id is null or owner_user_id=p_owner_id) and (p_customer_id is null or converted_customer_id=p_customer_id)),
 'converted_leads',(select count(*) from public.crm_leads where organization_id=p_organization_id and status='converted' and (p_owner_id is null or owner_user_id=p_owner_id) and (p_customer_id is null or converted_customer_id=p_customer_id))) into result;
 for cid in select distinct account_id from public.crm_opportunities where organization_id=p_organization_id and (p_customer_id is null or account_id=p_customer_id) and (p_owner_id is null or owner_user_id=p_owner_id) loop
  perform crm_private.log_sensitive_access(p_organization_id,'finance',case when cid is null then 'company' else 'customer' end,coalesce(cid,p_organization_id));
 end loop;
 return result;end $$;
revoke all on function public.crm_sales_report(uuid,uuid,uuid) from public,anon;
grant execute on function public.crm_sales_report(uuid,uuid,uuid) to authenticated;

create function crm_private.log_sensitive_access(org uuid,domain text,kind text,rid uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if domain not in ('finance','contract') or kind not in ('company','customer','contract','project') or not crm_private.can_access(org,domain||'.read',kind,rid) then raise exception 'Explicit read authorization required';end if;
 if (kind='company' and rid<>org) or (kind='customer' and not exists(select 1 from public.crm_accounts where organization_id=org and id=rid)) or (kind='contract' and not exists(select 1 from public.project_contracts where organization_id=org and id=rid)) or (kind='project' and not exists(select 1 from public.projects where organization_id=org and id=rid)) then raise exception 'Resource unavailable';end if;
 insert into public.crm_audit_log(organization_id,actor_user_id,event_type,resource_type,resource_id,customer_id,visibility,detail)
 values(org,auth.uid(),'access',kind,rid,case when kind='customer' then rid else null end,domain,'{}');
end $$;
revoke all on function crm_private.log_sensitive_access(uuid,text,text,uuid) from public,anon;
grant execute on function crm_private.log_sensitive_access(uuid,text,text,uuid) to authenticated;
create function public.crm_log_sensitive_access(p_organization_id uuid,p_domain text,p_resource_type text,p_resource_id uuid) returns void language sql security invoker set search_path='' as $$select crm_private.log_sensitive_access(p_organization_id,p_domain,p_resource_type,p_resource_id)$$;
revoke all on function public.crm_log_sensitive_access(uuid,text,text,uuid) from public,anon;
grant execute on function public.crm_log_sensitive_access(uuid,text,text,uuid) to authenticated;
create function public.crm_customer_summary(p_organization_id uuid,p_customer_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('contacts',(select count(*) from public.crm_contacts where organization_id=p_organization_id and account_id=p_customer_id),
 'projects',(select count(*) from public.projects where organization_id=p_organization_id and customer_id=p_customer_id),
 'contracts',(select count(*) from public.project_contracts where organization_id=p_organization_id and customer_id=p_customer_id),
 'opportunities',(select count(*) from public.crm_opportunities where organization_id=p_organization_id and account_id=p_customer_id),
 'invoices',(select count(*) from public.finance_invoices where organization_id=p_organization_id and customer_id=p_customer_id))
 where exists(select 1 from public.crm_accounts where id=p_customer_id and organization_id=p_organization_id)
$$;
revoke all on function public.crm_customer_summary(uuid,uuid) from public,anon;
grant execute on function public.crm_customer_summary(uuid,uuid) to authenticated;
commit;
