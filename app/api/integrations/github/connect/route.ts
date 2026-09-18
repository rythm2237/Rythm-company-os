import { startGitHubCustomerOAuth } from "@/lib/integrations/connections/github-customer-oauth";

export async function POST(request: Request) {
  return startGitHubCustomerOAuth(request);
}
