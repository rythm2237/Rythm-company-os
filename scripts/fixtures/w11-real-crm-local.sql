-- W11: real disposable Supabase/PostgreSQL constraint + RLS smoke.
-- Run ONLY against a locally created synthetic Supabase instance. All writes roll back.
\set ON_ERROR_STOP on
begin;
-- Auth identities are created by the local disposable postgres administrator, not by service_role.
insert into auth.users(id,email,aud,role)
values('00000000-0000-4000-8000-000000009101','w11-member@example.test','authenticated','authenticated');
set local role service_role;
set local request.jwt.claim.role = 'service_role';

do $w11$
declare
 org uuid; manager uuid; member uuid:='00000000-0000-4000-8000-000000009101';
 account uuid:=gen_random_uuid(); account2 uuid:=gen_random_uuid();
 project_a uuid:=gen_random_uuid(); project_b uuid:=gen_random_uuid();
 contract uuid:=gen_random_uuid(); invoice uuid:=gen_random_uuid();
 was_denied boolean;
begin
 select m.organization_id,m.user_id into org,manager from public.organization_members m
 where m.role='owner' and m.membership_status='active' order by m.created_at limit 1;
 if org is null or manager is null then raise exception 'W11: synthetic Owner fixture missing';end if;
 perform set_config('request.jwt.claim.sub',manager::text,true);
 -- Synthetic Auth identity was created above with local admin privileges.
 insert into public.organization_members(organization_id,user_id,role,membership_status)
 values(org,member,'viewer','active');
 insert into public.crm_accounts(id,organization_id,name,created_by_user_id) values
 (account,org,'W11 Disposable Account',manager),
 (account2,org,'W11 Disposable Other',manager);
 insert into public.crm_access_grants(organization_id,principal_type,principal_id,capability,resource_type,resource_id,granted_by)
 select org,'user',manager,capability,'company',org,manager from (values
 ('contract.create'),('contract.update'),('contract.read'),('finance.create'),('finance.update'),('finance.read')
 ) v(capability);
 insert into public.projects(id,organization_id,project_code,name,status,primary_manager_user_id,engagement_type,customer_id)
 values
 (project_a,org,'W11-REAL-PROJECT-A','W11 actual disposable A','planning',manager,'external',account),
 (project_b,org,'W11-REAL-PROJECT-B','W11 actual disposable B','planning',manager,'external',account);
 insert into public.project_contracts(id,organization_id,customer_id,contract_number,contract_status)
 values(contract,org,account,'W11-SYNTHETIC-CTR','draft');
 insert into public.project_contract_links(organization_id,project_id,contract_id)
 values(org,project_a,contract),(org,project_b,contract);
 if (select count(*) from public.projects p where p.organization_id=org and p.primary_manager_user_id=manager and p.id in (project_a,project_b))<>2
 then raise exception 'W11: one human manager across two projects failed'; end if;

 was_denied:=false;
 begin
  update public.project_contracts set customer_id=account2 where id=contract;
 exception when others then
  if sqlerrm like '%Cannot reassign customer while linked commercial records%' then was_denied:=true;else raise;end if;
 end;
 if not was_denied then raise exception 'W11: contract customer drift permitted';end if;

 was_denied:=false;
 begin
  update public.projects set customer_id=account2 where id=project_a;
 exception when others then
  if sqlerrm like '%Reconcile linked commercial records%' then was_denied:=true;else raise;end if;
 end;
 if not was_denied then raise exception 'W11: linked project customer drift permitted';end if;

 insert into public.finance_invoices(id,organization_id,customer_id,project_id,contract_id,internal_reference,status,total)
 values(invoice,org,account,project_a,contract,'W11-REAL-INV','issued',50);
 was_denied:=false;
 begin
  delete from public.project_contract_links where organization_id=org and project_id=project_a and contract_id=contract;
 exception when others then
  if sqlerrm like '%Cannot remove a contract-project link referenced%' then was_denied:=true;else raise;end if;
 end;
 if not was_denied then raise exception 'W11: financial contract link deletion permitted';end if;

 -- Ledger row is a synthetic posted transaction, not a payment-provider operation.
 insert into public.finance_transactions(organization_id,customer_id,project_id,contract_id,invoice_id,
  transaction_type,status,category,description,amount,currency,source_type)
 values(org,account,project_a,contract,invoice,'revenue','posted','invoice','W11 disposable ledger',10,'EUR','manual');
 was_denied:=false;
 begin
  update public.finance_invoices set project_id=project_b where id=invoice;
 exception when others then
  if sqlerrm like '%Invoice attribution conflicts with posted transactions%' or sqlerrm like '%Issued invoice identity and relationships are historical records%' then was_denied:=true;else raise;end if;
 end;
 if not was_denied then raise exception 'W11: invoice payment attribution rewrite permitted';end if;

 was_denied:=false;
 begin
  update public.finance_transactions set project_id=project_b where organization_id=org and invoice_id=invoice;
 exception when others then
  if sqlerrm like '%Transaction invoice attribution mismatch%' or sqlerrm like '%Payment must use its invoice relationships%' then was_denied:=true;else raise;end if;
 end;
 if not was_denied then raise exception 'W11: payment ledger attribution rewrite permitted';end if;

 was_denied:=false;
 begin
  update public.project_manager_history set reason='TAMPER' where organization_id=org and project_id=project_a;
 exception when others then
  if sqlerrm like '%Project manager assignment history is immutable%' then was_denied:=true;else raise;end if;
 end;
 if not was_denied then raise exception 'W11: manager history rewrite permitted';end if;

 if not exists(select 1 from public.project_manager_history where organization_id=org and project_id=project_a and new_manager_user_id=manager)
 then raise exception 'W11: manager creation history not recorded';end if;
 raise notice 'W11 real PostgreSQL synthetic parent/link/ledger/history invariants PASS';
end $w11$;

-- Authenticated user with no explicit contract/finance grant sees zero records.
reset role;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000009101';
do $w11_rls$
begin
 if (select count(*) from public.project_contracts where contract_number='W11-SYNTHETIC-CTR')<>0
 then raise exception 'W11: member contract RLS leakage';end if;
 if (select count(*) from public.finance_invoices where internal_reference='W11-REAL-INV')<>0
 then raise exception 'W11: member invoice RLS leakage';end if;
 raise notice 'W11 real PostgreSQL revoked/ungranted member finance and contract RLS PASS';
end $w11_rls$;
reset role;
rollback;
