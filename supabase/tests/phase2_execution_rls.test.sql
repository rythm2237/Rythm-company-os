begin;
select plan(8);
select has_table('public','integration_tool_registry','tool registry exists');
select has_table('public','tool_execution_attempts','attempt ledger exists');
select has_table('public','execution_rollout_config','rollout control exists');
select has_table('public','execution_validation_records','reversible validation resource exists');
select ok((select relrowsecurity from pg_class where oid='public.tool_execution_requests'::regclass),'execution ledger has RLS');
select ok((select relrowsecurity from pg_class where oid='public.tool_execution_attempts'::regclass),'attempt ledger has RLS');
select ok(
  not has_table_privilege('anon','public.tool_execution_requests','select')
  and not has_table_privilege('anon','public.tool_execution_requests','insert')
  and not has_table_privilege('anon','public.tool_execution_requests','update')
  and not has_table_privilege('anon','public.tool_execution_requests','delete'),
  'anon has no execution-ledger access'
);
select ok(
  not has_table_privilege('authenticated','public.tool_execution_requests','insert')
  and not has_table_privilege('authenticated','public.tool_execution_requests','update')
  and not has_table_privilege('authenticated','public.tool_execution_requests','delete'),
  'authenticated clients cannot forge execution lifecycle state'
);
select * from finish();
rollback;
