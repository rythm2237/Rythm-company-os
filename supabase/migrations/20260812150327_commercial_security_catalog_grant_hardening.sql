-- RYTHM Company OS — harden explicit Supabase role grants for the commercial catalog.
--
-- This migration mirrors Supabase Production migration 20260812150327.
-- It records the already-deployed grant hardening without changing catalog data.

revoke all privileges on table public.commercial_offers
from anon, authenticated;

grant select on table public.commercial_offers
to anon, authenticated;

revoke execute on function public.has_active_organization_entitlement(uuid)
from public, anon, authenticated;

grant execute on function public.has_active_organization_entitlement(uuid)
to authenticated;

revoke execute on function public.enforce_active_commercial_entitlement()
from public, anon, authenticated;
