# Customer Connection Platform — Phase 1

## Implemented boundary

Phase 1 separates a company authorization from discovered provider resources and verified project bindings. A local service row is never proof of authorization. The database rejects a `connected` transition unless a Vault credential, verification timestamp, connection timestamp and explicit verified result are present.

Available customer adapters are Google Search Console, Google Analytics 4, Google Workspace, Microsoft 365, GitHub, Vercel, Supabase and Cloudflare. The four Google/Microsoft adapters use provider OAuth in a new tab. GitHub, Vercel, Supabase and Cloudflare accept a provider-issued token, call the real provider API, discover resources, and only then store the credential in Vault and mark the connection verified.

Catalog-only services are labelled `setup_available` or `coming_later`; their presence never implies an adapter exists.

## Google production configuration

Human/provider-console action remains required:

1. Configure the OAuth consent screen for the RYTHM production app and publish it from testing when ready.
2. Add `rythm-os.com` as an authorized domain and verify domain ownership.
3. Configure the production home page, privacy policy, terms and support/contact links.
4. Register these exact HTTPS redirect URIs:
   - `https://rythm-os.com/api/integrations/google-search-console/callback`
   - `https://rythm-os.com/api/integrations/google-analytics/callback`
   - `https://rythm-os.com/api/integrations/google-workspace/callback`
5. Enable Search Console API, Google Analytics Admin API, Gmail API and Calendar API in the same Google Cloud project.
6. Declare and justify least-privilege scopes: `webmasters.readonly`, `analytics.readonly`, `gmail.readonly`, `calendar.readonly`, plus OpenID email identity.
7. Submit Google's verification package when Google classifies the selected scopes or branding as requiring review. Do not claim approval until Google confirms it.
8. Configure `GOOGLE_WORKSPACE_CLIENT_ID` and `GOOGLE_WORKSPACE_CLIENT_SECRET` only in Vercel server-side Production/Preview environments.

## Microsoft Entra production configuration

Human/provider-console action remains required:

1. Create or select the RYTHM Entra app registration and choose the intended tenant policy (`common`, organizations, or a specific tenant).
2. Register `https://rythm-os.com/api/integrations/microsoft-365/callback` as a Web redirect URI.
3. Configure verified publisher/domain, privacy statement, terms and support links.
4. Grant the minimum delegated permissions currently used: `openid`, `profile`, `email`, `offline_access`, and `User.Read`.
5. Complete publisher verification or admin consent when the tenant policy requires it. Do not claim completion before Entra confirms it.
6. Configure `MICROSOFT_365_CLIENT_ID`, `MICROSOFT_365_CLIENT_SECRET` and, when applicable, `MICROSOFT_365_TENANT_ID` in server-side Vercel environments.

## Phase 2 exclusion

No Computer Use, Cloud Browser, autonomous external navigation, Take Control, Watch Live or persistent browser session is implemented here. `integration_setup_sessions` stores the shared manual setup plan and resume-safe state that a future Phase 2 agent can consume without redesigning the connection model.
