import { maybeHandleAgentOAuthCallback } from "@/lib/integrations/connections/agent-oauth-callback";
import { finishCustomerCoreOAuth } from "@/lib/integrations/connections/customer-platform-oauth";
import { finishGitHubExistingInstallationOAuth } from "@/lib/integrations/connections/github-customer-oauth";

export async function GET(request: Request) {
  const agentResponse = await maybeHandleAgentOAuthCallback(request, "github");
  if (agentResponse) return agentResponse;
  const existingInstallationResponse = await finishGitHubExistingInstallationOAuth(request);
  if (existingInstallationResponse) return existingInstallationResponse;
  return finishCustomerCoreOAuth(request, "github");
}
