import type { DirectExecutionInventoryItem } from "@/lib/integrations/direct-execution-inventory";

export const CONNECTION_AGENT_OAUTH_BOUNDARY: DirectExecutionInventoryItem = {
  path: "lib/integrations/connections/agent-oauth-callback.ts",
  classification: ["B", "D"],
  disposition: "platform_control_boundary",
  owner: "Integration Gateway / Connection Setup Agent",
  scope: "Human-authorized OAuth code exchange, read-only identity/resource verification, and secure connection establishment for the Connection Flight Deck",
  risk: "External authorization, credential issuance, and provider metadata reads",
  reason: "This boundary establishes a verified company connection after explicit Human provider consent. It cannot execute business actions; all subsequent operational capabilities remain governed by the Integration & Execution Gateway.",
  migrationPlan: "Permanent OAuth control-plane boundary shared by validated Connection Agent OAuth providers. New OAuth providers require explicit scope and callback review.",
  reviewPoint: "Every OAuth provider, scope, callback, credential-storage, PKCE, Human Takeover, or resource-verification change",
};
