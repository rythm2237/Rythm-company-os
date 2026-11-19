-- Evaluate the customer grant using the proposed row. The contract ID does
-- not yet resolve through a table lookup during INSERT or INSERT RETURNING.
begin;

alter policy crm_create on public.project_contracts
  with check (
    public.crm_can(organization_id, 'contract.create', 'contract', id)
    or (
      customer_id is not null
      and public.crm_can(organization_id, 'contract.create', 'customer', customer_id)
    )
  );

alter policy crm_read on public.project_contracts
  using (
    public.crm_can(organization_id, 'contract.read', 'contract', id)
    or (
      customer_id is not null
      and public.crm_can(organization_id, 'contract.read', 'customer', customer_id)
    )
  );

commit;
