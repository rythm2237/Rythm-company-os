-- W04: catalog-derived runtime probe for EVERY authenticated-callable public
-- SECURITY DEFINER RPC. STAGING ONLY. Does not claim every per-tenant authority
-- branch is proven: this specifically tests an outsider synthetic JWT with
-- deliberately invalid/non-owned IDs and records every actual outcome.
-- No notification/outbound triggers: local replica mode; ALL writes ROLLBACK.
begin;
set local statement_timeout = '30000ms';
set local session_replication_role = replica;
create temporary table w04_outsider_result (
  signature text primary key,
  outcome text not null,
  result text,
  error_state text
) on commit drop;
grant select,insert on pg_temp.w04_outsider_result to authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000444',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

do $w04$
declare
  r record;
  i integer;
  v_type text;
  v_name text;
  v_args text;
  v_val text;
  v_query text;
  v_out jsonb;
  v_state text;
  v_message text;
begin
  if current_setting('session_replication_role') <> 'replica' then
    raise exception 'External notification triggers must be suppressed'; end if;
  if auth.uid() is distinct from '00000000-0000-4000-8000-000000000444'::uuid then
    raise exception 'Synthetic outsider JWT was not established'; end if;
  for r in
    select p.*,n.nspname
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
    order by p.proname,p.oid::regprocedure::text
  loop
    v_args := '';
    for i in 0..r.pronargs-1 loop
      v_type := pg_catalog.format_type(r.proargtypes[i],null);
      v_name := coalesce(r.proargnames[i+1],'');
      if r.proargtypes[i] = 'uuid'::regtype
        and v_name ~* '(^|_)(org|organization)(_|$)' then
        v_val := '(select id from public.organizations where slug=''w02-synthetic-b-staging-v1'')';
      elsif r.proargtypes[i] = 'uuid'::regtype then
        v_val := '''00000000-0000-4000-8000-000000000445''::uuid';
      elsif r.proargtypes[i] = 'text'::regtype then
        v_val := '''w04-not-authorized''::text';
      elsif r.proargtypes[i] = 'integer'::regtype
        or r.proargtypes[i] = 'smallint'::regtype then
        v_val := '1::'||v_type;
      elsif r.proargtypes[i] = 'boolean'::regtype then
        v_val := 'false::boolean';
      elsif r.proargtypes[i] = 'numeric'::regtype then
        v_val := '1::numeric';
      elsif r.proargtypes[i] = 'jsonb'::regtype then
        v_val := '''{}''::jsonb';
      elsif r.proargtypes[i] = 'text[]'::regtype then
        v_val := '''{}''::text[]';
      elsif r.proargtypes[i] = 'date'::regtype then
        v_val := '''2099-11-06''::date';
      elsif r.proargtypes[i] = 'timestamp with time zone'::regtype then
        v_val := '''2099-11-06 10:00:00+00''::timestamptz';
      else
        v_val := 'null::'||v_type;
      end if;
      v_args:=v_args||case when i>0 then ',' else '' end||v_val;
    end loop;
    v_query := pg_catalog.format(
      'select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from %I.%I(%s) t',
      r.nspname,r.proname,v_args
    );
    begin
      execute v_query into v_out;
      insert into pg_temp.w04_outsider_result(signature,outcome,result)
      values(r.oid::regprocedure::text,'RETURNED',left(v_out::text,500));
    exception when others then
      get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
      insert into pg_temp.w04_outsider_result(signature,outcome,error_state,result)
      values(r.oid::regprocedure::text,'EXCEPTION',v_state,left(v_message,300));
    end;
  end loop;
end;
$w04$;

reset role;
do $assert$
declare v_expected int; v_actual int;
begin
  select count(*) into v_expected
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and has_function_privilege('authenticated',p.oid,'EXECUTE');
  select count(*) into v_actual from pg_temp.w04_outsider_result;
  if v_expected<>51 or v_actual<>v_expected then
    raise exception 'Coverage mismatch expected 51 live authenticated definer RPCs, actual % / %',
      v_expected,v_actual; end if;
end;
$assert$;

select jsonb_build_object(
  'probed',count(*),
  'exceptions',count(*) filter(where outcome='EXCEPTION'),
  'returned',count(*) filter(where outcome='RETURNED'),
  'results',coalesce(jsonb_agg(jsonb_build_object(
    'signature',signature,'outcome',outcome,'state',error_state,'result',result)
    order by signature),'[]'::jsonb)
) as w04_outsider_matrix from pg_temp.w04_outsider_result;
rollback;
