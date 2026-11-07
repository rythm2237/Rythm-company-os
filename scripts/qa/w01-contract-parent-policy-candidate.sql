-- W01 staging-only candidate. Production baseline remains unchanged.
-- Authorize a new contract using its supplied customer, before the contract row
-- exists. The old contract-id lookup cannot resolve that relationship on INSERT.
-- SELECT also needs the direct parent check for INSERT ... RETURNING snapshots.
ALTER POLICY crm_create ON public.project_contracts WITH CHECK (
  public.crm_can(organization_id, 'contract.create', 'contract', id)
  OR (customer_id IS NOT NULL AND public.crm_can(organization_id, 'contract.create', 'customer', customer_id))
);
ALTER POLICY crm_read ON public.project_contracts USING (
  public.crm_can(organization_id, 'contract.read', 'contract', id)
  OR (customer_id IS NOT NULL AND public.crm_can(organization_id, 'contract.read', 'customer', customer_id))
);
