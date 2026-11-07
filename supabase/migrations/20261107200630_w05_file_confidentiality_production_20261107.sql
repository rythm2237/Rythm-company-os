-- W05 Production migration ledger reconciliation, 2026-11-07.
-- Applied via Supabase with version 20261107200630; original schema is in
-- 20261107060000_w05_file_confidentiality.sql (executed on Production).
-- Never manufacture migration history: this version only verifies schema state
-- so fresh environments replay the original migration before this check.
do $w05_ledger$ begin
  if not exists (
    select 1 from pg_policy
    where polrelid='storage.objects'::regclass
      and polname='w05_no_signed_private_downloads'
      and not polpermissive and polcmd='r'
  ) then
    raise exception 'W05 signed-URL restrictive policy missing';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.project_documents'::regclass
      and tgname='w05_project_document_storage_guard'
      and tgenabled in ('O','A') and not tgisinternal
  ) then
    raise exception 'W05 immutable document path trigger missing';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='crm_private' and p.proname='project_document_storage_boundary'
      and not p.prosecdef
  ) then
    raise exception 'W05 invoker-only document path function missing';
  end if;
end $w05_ledger$;
