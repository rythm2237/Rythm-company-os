-- Keep public pricing CTAs out of the authenticated /billing route so crawlers
-- and signed-out visitors do not hit the intentional setup redirect.
update commercial_offers
set cta_href = '/login?next=%2Fbilling'
where offer_code in ('ai_workspace_starter', 'ai_workspace_pro', 'ai_workspace_power')
  and status = 'public'
  and cta_href = '/billing';
