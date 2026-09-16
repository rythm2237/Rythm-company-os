import type { DirectExecutionInventoryItem } from "@/lib/integrations/direct-execution-inventory";

export const CONNECTION_PLATFORM_DIRECT_BOUNDARIES: DirectExecutionInventoryItem[] = [
  {
    path: "lib/integrations/connections/github-app.ts",
    classification: ["B", "D"],
    disposition: "platform_control_boundary",
    owner: "Integration Gateway / Customer Connection Platform",
    scope: "GitHub App installation verification, short-lived installation token issuance, and repository discovery during provider connection setup",
    risk: "External GitHub control-plane access and short-lived provider credential issuance",
    reason: "This boundary establishes and verifies a Human-approved GitHub App installation. It does not grant Agent authority to mutate repositories; operational repository actions remain behind registered tools, capabilities, approvals, and the Execution Gateway.",
    migrationPlan: "Permanent connection control-plane boundary. Keep installation credentials short-lived and route every operational GitHub action through the canonical provider adapter/Gateway.",
    reviewPoint: "Every GitHub App permission, event subscription, installation-token, repository-selection, or operational-capability change",
  },
  {
    path: "lib/integrations/connections/platform-oauth.ts",
    classification: ["B", "D"],
    disposition: "platform_control_boundary",
    owner: "Integration Gateway / Customer Connection Platform",
    scope: "Vercel, Supabase, and Cloudflare OAuth code exchange, token refresh, account verification, and read-only resource discovery",
    risk: "External provider authorization, refresh-token exchange, and provider metadata reads",
    reason: "This boundary establishes a Human-approved company connection and discovers the resources that can be bound to a RYTHM project. It cannot authorize consequential provider mutations; those remain governed by capabilities and the Execution Gateway.",
    migrationPlan: "Permanent OAuth control-plane boundary with provider-specific adapters for operational actions. Keep redirect URIs, scopes, refresh semantics, and discovery endpoints explicitly allowlisted and reviewed.",
    reviewPoint: "Every OAuth scope, redirect URI, token endpoint, refresh behavior, resource-discovery endpoint, or provider addition",
  },
  {
    path: "lib/integrations/connections/provider-credentials.ts",
    classification: ["B", "D"],
    disposition: "platform_control_boundary",
    owner: "Integration Gateway / Credential Lifecycle",
    scope: "Server-side OAuth access-token refresh and GitHub installation-token resolution for already verified organization integrations",
    risk: "Credential lifecycle operations using secrets stored in Vault",
    reason: "This module resolves a valid short-lived credential for an already-authorized connection. It does not choose or execute business actions and never exposes refresh tokens or private keys to Agents or the browser.",
    migrationPlan: "Permanent credential-lifecycle boundary. Provider business actions continue through registered adapters and the Execution Gateway; credential material remains server-only and Vault-backed.",
    reviewPoint: "Every credential format, refresh flow, Vault storage mutation, token lifetime, or provider authentication-mode change",
  },
];
