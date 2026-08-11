"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/auth/organization-context";

export async function switchOrganization(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const next = String(formData.get("next") ?? "/command-center");
  if (!organizationId) redirect("/command-center?error=Organization%20selection%20is%20required.");

  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: selectedOrganizationId, error } = await supabase.rpc("set_active_organization", {
    target_org_id: organizationId,
  });

  if (error || String(selectedOrganizationId ?? "") !== organizationId) {
    console.error("organization_context_switch_failed", { userId: user.id, organizationId, error });
    redirect("/command-center?error=You%20are%20not%20authorized%20for%20that%20organization.");
  }

  // Cookie is a non-authoritative UI/cache hint. Database active_organization_id is
  // the source of truth and the RPC above validates membership before changing it.
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/command-center";
  redirect(safeNext);
}
