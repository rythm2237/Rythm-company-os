import { maybeHandleAgentOAuthCallback } from "@/lib/integrations/connections/agent-oauth-callback";
import { finishCustomerCoreOAuth } from "@/lib/integrations/connections/customer-platform-oauth";

export async function GET(request: Request) {
  const agentResponse = await maybeHandleAgentOAuthCallback(request, "supabase");
  if (agentResponse) return agentResponse;
  return finishCustomerCoreOAuth(request, "supabase");
}
