import { resolveOrganizationContext } from "@/lib/auth/organization-context";

export async function resolveOwnerApiOrganizationContext() {
  const context = await resolveOrganizationContext();
  if (!context) return { ok: false as const, status: 401, error: "Authentication required." };
  if (context.role !== "owner") return { ok: false as const, status: 403, error: "Owner authorization required." };
  return { ok: true as const, ...context };
}
