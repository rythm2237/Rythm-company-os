"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin/authorization";

export async function recordAssistedBillingAction(form: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const organizationId = field("organizationId");
  const orderId = field("orderId");
  if (!uuid.test(organizationId) || (orderId && !uuid.test(orderId))) throw new Error("Invalid billing target");
  const path = `/admin/customers/${organizationId}`;
  if (field("verified") !== "yes") redirect(`${path}?activationError=Confirm%20external%20evidence%20first`);
  const date = (name: string) => field(name) ? `${field(name)}T00:00:00Z` : null;
  const { error } = await supabase.rpc("platform_assisted_billing_v1", {
    p_organization_id: organizationId,
    p_action: field("step"),
    p_order_id: orderId || null,
    p_details: {
      reference: field("reference"),
      invoice: field("invoice"),
      currency: field("currency"),
      amount: field("amount") || null,
      agentLimit: field("agentLimit") || null,
      start: date("start"),
      end: date("end"),
      due: date("due"),
    },
  });
  if (error) {
    const expected = error.code === "P0001";
    redirect(`${path}?activationError=${encodeURIComponent(expected ? error.message : "Billing update failed. Verify the evidence, review duplicate references, and retry.")}`);
  }
  revalidatePath(path);
  revalidatePath("/activation");
  revalidatePath("/billing");
  redirect(`${path}?activation=recorded`);
}
