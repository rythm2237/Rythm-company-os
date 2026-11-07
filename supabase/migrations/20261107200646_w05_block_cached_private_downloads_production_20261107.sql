-- W05 Production migration ledger reconciliation, 2026-11-07.
-- Applied with version 20261107200646; original DDL is in
-- 20261107070000_w05_block_cached_private_downloads.sql.
-- This check intentionally makes no policy or data changes.
do $w05_ledger$ begin
  if not exists (
    select 1 from pg_policy
    where polrelid='storage.objects'::regclass
      and polname='w05_no_private_authenticated_direct_get'
      and not polpermissive and polcmd='r'
      and pg_get_expr(polqual,polrelid) ilike '%object.get_authenticated%'
  ) then
    raise exception 'W05 authenticated private GET restrictive policy missing';
  end if;
end $w05_ledger$;
