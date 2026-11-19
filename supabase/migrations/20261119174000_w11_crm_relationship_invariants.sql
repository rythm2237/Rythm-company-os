-- W11: reject contradictory CRM/project/contract/finance attribution after parent changes.
-- No legacy auto-reconciliation, no production write; preserve existing authorization triggers.
begin;

create or replace function crm_private.project_guard() returns trigger language plpgsql security definer set search_path='' as $$
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
 exists(select 1 from public.finance_invoices i where i.project_id=new.id and i.customer_id is distinct from new.customer_id) or
  exists(select 1 from public.finance_transactions t where t.project_id=new.id and t.customer_id is distinct from new.customer_id) or
  exists(select 1 from public.project_contracts c where c.project_id=new.id and c.customer_id is distinct from new.customer_id) or
  exists(select 1 from public.project_documents d where d.project_id=new.id and d.customer_id is not null and d.customer_id is distinct from new.customer_id)) then raise exception 'Reconcile linked commercial records before changing the customer';end if;

 if changed and auth.uid() is not null and not crm_private.can_access(new.organization_id,'project.assign_manager','project',new.id) then raise exception 'Project ownership permission required'; end if;
 if tg_op='INSERT' and auth.uid() is null then raise exception 'An accountable user must create projects'; end if;
 if tg_op='UPDATE' and new.primary_manager_user_id is distinct from old.primary_manager_user_id then
  if auth.uid() is null then raise exception 'Manager reassignment requires a user'; end if;
  insert into public.project_manager_history(organization_id,project_id,previous_manager_user_id,new_manager_user_id,actor_user_id,reason)
  values(new.organization_id,new.id,old.primary_manager_user_id,new.primary_manager_user_id,auth.uid(),nullif(current_setting('rythm.manager_reason',true),''));
 end if;
 return new;
end $$;

create or replace function crm_private.contract_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.customer_id is null and (tg_op='INSERT' or not new.crm_reconciliation_required) then raise exception 'A contract requires exactly one customer'; end if;
 if new.customer_id is not null then new.crm_reconciliation_required:=false; end if;
 if tg_op='UPDATE' and new.organization_id<>old.organization_id then raise exception 'Contract company cannot be changed'; end if;
 if new.project_id is not null and not exists(select 1 from public.projects p where p.id=new.project_id and p.organization_id=new.organization_id and p.customer_id=new.customer_id) then raise exception 'Contract and project customers must match'; end if;
 if new.amendment_of is not null and not exists(select 1 from public.project_contracts c where c.id=new.amendment_of and c.organization_id=new.organization_id and c.customer_id=new.customer_id and c.id<>new.id) then raise exception 'Invalid parent contract'; end if;
 if new.contract_status in ('approved','active') and (tg_op='INSERT' or new.contract_status is distinct from old.contract_status) and not crm_private.can_access(new.organization_id,'contract.approve','contract',new.id) then raise exception 'Explicit contract approval permission required'; end if;
 if tg_op='UPDATE' and new.customer_id is distinct from old.customer_id and (
  exists(select 1 from public.project_contract_links l join public.projects p on p.organization_id=l.organization_id and p.id=l.project_id where l.organization_id=new.organization_id and l.contract_id=new.id and p.customer_id is distinct from new.customer_id) or
  exists(select 1 from public.finance_invoices i where i.organization_id=new.organization_id and i.contract_id=new.id and i.customer_id is distinct from new.customer_id) or
  exists(select 1 from public.finance_transactions t where t.organization_id=new.organization_id and t.contract_id=new.id and t.customer_id is distinct from new.customer_id) or
  exists(select 1 from public.project_documents d where d.organization_id=new.organization_id and d.contract_id=new.id and d.customer_id is distinct from new.customer_id) or
  exists(select 1 from public.project_contracts child where child.organization_id=new.organization_id and child.amendment_of=new.id and child.customer_id is distinct from new.customer_id)
 ) then raise exception 'Cannot reassign customer while linked commercial records refer to another customer';end if;
 return new;
end $$;

create or replace function crm_private.link_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or (tg_op='UPDATE' and (new.organization_id,new.project_id,new.contract_id) is distinct from (old.organization_id,old.project_id,old.contract_id)) then
  if exists(select 1 from public.finance_invoices i where i.organization_id=old.organization_id and i.project_id=old.project_id and i.contract_id=old.contract_id)
     or exists(select 1 from public.finance_transactions t where t.organization_id=old.organization_id and t.project_id=old.project_id and t.contract_id=old.contract_id)
     or exists(select 1 from public.project_documents d where d.organization_id=old.organization_id and d.project_id=old.project_id and d.contract_id=old.contract_id) then
   raise exception 'Cannot remove a contract-project link referenced by financial or confidential records';
  end if;
  if tg_op='DELETE' then return old;end if;
 end if;
 if not exists(select 1 from public.projects p join public.project_contracts c on c.organization_id=p.organization_id and c.customer_id=p.customer_id where p.id=new.project_id and c.id=new.contract_id and p.organization_id=new.organization_id) then raise exception 'Project and contract customers must match'; end if;return new;
end $$;

drop trigger crm_link_guard on public.project_contract_links;
create trigger crm_link_guard before insert or update or delete on public.project_contract_links
 for each row execute function crm_private.link_guard();

create or replace function crm_private.document_relationship_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.project_id is null and new.contract_id is null then raise exception 'Document requires a project or contract';end if;
 if new.project_id is not null and new.customer_id is not null and not exists(
  select 1 from public.projects p where p.id=new.project_id and p.organization_id=new.organization_id and p.customer_id is not distinct from new.customer_id
 ) then raise exception 'Document project and customer mismatch';end if;
 if new.project_id is not null and new.contract_id is not null and not exists(
  select 1 from public.project_contract_links l where l.organization_id=new.organization_id and l.project_id=new.project_id and l.contract_id=new.contract_id
 ) then raise exception 'Document contract is not linked to project';end if;
 if new.contract_id is not null then
  if not exists(select 1 from public.project_contracts c where c.id=new.contract_id and c.organization_id=new.organization_id and c.customer_id=new.customer_id) then raise exception 'Document customer mismatch';end if;
  new.confidentiality:='contract';new.legal_document:=true;
 end if;
 return new;
end $$;

CREATE OR REPLACE FUNCTION crm_private.relationship_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$begin
 if new.project_id is not null and not exists(select 1 from public.projects where id=new.project_id and organization_id=new.organization_id and customer_id is not distinct from new.customer_id) then raise exception 'Project customer mismatch';end if;
 if new.contract_id is not null and not exists(select 1 from public.project_contracts where id=new.contract_id and organization_id=new.organization_id and customer_id is not distinct from new.customer_id) then raise exception 'Contract customer mismatch';end if;
 if new.project_id is not null and new.contract_id is not null and not exists(select 1 from public.project_contract_links where organization_id=new.organization_id and project_id=new.project_id and contract_id=new.contract_id) then raise exception 'The selected contract is not linked to this project';end if;
 if tg_table_name='finance_transactions' and new.invoice_id is not null and not exists(
   select 1 from public.finance_invoices i where i.organization_id=new.organization_id and i.id=new.invoice_id
   and i.customer_id is not distinct from new.customer_id and i.project_id is not distinct from new.project_id
   and i.contract_id is not distinct from new.contract_id
 ) then raise exception 'Transaction invoice attribution mismatch';end if;
 if tg_table_name='finance_invoices' and tg_op='UPDATE'
   and (new.customer_id,new.project_id,new.contract_id) is distinct from (old.customer_id,old.project_id,old.contract_id)
   and exists(select 1 from public.finance_transactions t where t.organization_id=new.organization_id and t.invoice_id=new.id
    and (t.customer_id,t.project_id,t.contract_id) is distinct from (new.customer_id,new.project_id,new.contract_id))
 then raise exception 'Invoice attribution conflicts with posted transactions';end if;
 return new;
end $$;

-- Assignment history is append-only even for privileged service writes.
create function crm_private.w11_reject_manager_history_mutation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Project manager assignment history is immutable';
end $$;
revoke all on function crm_private.w11_reject_manager_history_mutation() from public,anon,authenticated;
create trigger w11_manager_history_append_only before update or delete
 on public.project_manager_history for each row execute function crm_private.w11_reject_manager_history_mutation();
revoke truncate on public.project_manager_history from authenticated,service_role;

commit;
