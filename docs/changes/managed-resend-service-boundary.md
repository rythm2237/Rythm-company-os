# Managed Resend service boundary

The RYTHM-managed Resend transport uses the Production `RESEND_API_KEY` server environment secret. It does not copy that secret into tenant Vault records.

`ensure_managed_resend_integration_v1` is service-role only and is the sole provisioning path for the canonical `RYTHM Managed Resend` integration. A transaction-local capability flag allows the existing verified-connection trigger to accept that exact platform-managed integration without weakening the generic Vault requirement for customer-managed integrations.

Tenant owners cannot create, mutate, or re-identify the managed Resend integration directly. Human message approval and the Integration & Execution Gateway remain required for external delivery.
