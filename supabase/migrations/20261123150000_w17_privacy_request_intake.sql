begin;

-- Only operators may set verification, closure, deadlines or internal notes.
revoke all privileges on table public.privacy_requests from public, anon, authenticated;
grant insert (requested_by_user_id, organization_id, request_type, scope, requester_note)
  on public.privacy_requests to authenticated;
grant select (id, request_type, scope, organization_id, status, received_at,
              due_at, verified_at, completed_at, created_at, updated_at)
  on public.privacy_requests to authenticated;
-- Required by the existing requester filter and by clients that find their own cases.
grant select (requested_by_user_id) on public.privacy_requests to authenticated;

alter policy privacy_requests_insert_own on public.privacy_requests
  with check (
    requested_by_user_id = (select auth.uid())
    and (requester_note is null or char_length(requester_note) <= 2000)
    and (
      (scope = 'account' and organization_id is null)
      or (scope = 'organization' and organization_id is not null
          and public.is_org_owner(organization_id))
    )
  );

commit;
