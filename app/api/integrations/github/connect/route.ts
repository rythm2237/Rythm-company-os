import { startCustomerCoreOAuth } from "@/lib/integrations/connections/customer-platform-oauth";

export async function POST(request: Request) {
  return startCustomerCoreOAuth(request, "github");
}
