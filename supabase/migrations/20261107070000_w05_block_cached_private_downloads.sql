-- W05 follow-up: Supabase CDN can serve a cached authenticated private object
-- after its membership was revoked. The first W05 signed-URL policy alone
-- cannot provide immediate revocation while object.get_authenticated is allowed.
-- App/server downloads must use request-time authorization and service-role
-- transport, NEVER caller-reachable cached Storage endpoints.
-- REVIEW ONLY: production needs separate owner approval and rollout order.
begin;
drop policy if exists w05_no_private_authenticated_direct_get on storage.objects;
create policy w05_no_private_authenticated_direct_get on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id not in ('project-files','company-knowledge','agent-artifacts','agent-attachments','ai-workspace-private')
    or not storage.allow_any_operation(array['object.get_authenticated'])
  );
comment on policy w05_no_private_authenticated_direct_get on storage.objects is
  'W05: prevent direct cached JWT Storage downloads of private files; use per-request-authorized application proxy. Existing CDN cache entries may persist through TTL.';
commit;
