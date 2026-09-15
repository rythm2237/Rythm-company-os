export type ConnectionState =
  | "not_started" | "setup_required" | "authorizing" | "verifying" | "connected"
  | "needs_attention" | "reauth_required" | "revoked" | "error" | "disconnected";

export type DiscoveredResource = {
  resourceType: string;
  resourceId: string;
  resourceName: string;
  metadata?: Record<string, unknown>;
};

export type ConnectionVerification = {
  accountRef: string | null;
  grantedScopes: string[];
  resources: DiscoveredResource[];
  detail: Record<string, unknown>;
};

export interface ProviderConnectionAdapter {
  readonly providerKey: string;
  readonly authorization: "oauth" | "token";
  verifyCredential(credential: string): Promise<ConnectionVerification>;
  discoverResources(credential: string): Promise<DiscoveredResource[]>;
  healthCheck(credential: string): Promise<{ healthy: boolean; code: string }>;
  startAuthorization?: (input: Record<string, unknown>) => Promise<URL>;
  handleCallback?: (input: Record<string, unknown>) => Promise<ConnectionVerification>;
  refreshCredential?: (credential: string) => Promise<string>;
  bindResource?: (resource: DiscoveredResource, capabilities: string[]) => Promise<void>;
  disconnect?: (credential: string) => Promise<void>;
  reconnect?: (input: Record<string, unknown>) => Promise<URL>;
}
