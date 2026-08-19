-- Tighten table grants in addition to RLS.
revoke all on table public.role_mastery_benchmarks from anon;
revoke all on table public.agent_mastery_assessments from anon;
revoke all on table public.company_knowledge_chunks from anon;
revoke insert,update,delete,truncate on table public.role_mastery_benchmarks from authenticated;
revoke insert,update,delete,truncate on table public.agent_mastery_assessments from authenticated;
grant select on table public.role_mastery_benchmarks to authenticated;
grant select on table public.agent_mastery_assessments to authenticated;
grant select,insert,update,delete on table public.company_knowledge_chunks to authenticated;
