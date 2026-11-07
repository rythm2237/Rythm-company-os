-- W03 production ledger reconciliation (applied via Supabase on 2026-11-07).
-- The schema definitions are in 20261104192628_w03_agent_memory_attachment_tenant_relations.sql.
do $w03_check$ begin
  if (select count(*) from pg_constraint where conname like '%_w03_%') <> 14
     or not exists (select 1 from pg_constraint where conname='agent_memories_source_tenant_w03_fk')
  then raise exception 'W03 expected 14 constraints missing'; end if;
end $w03_check$;
