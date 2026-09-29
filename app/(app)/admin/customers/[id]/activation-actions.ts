"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin/authorization";

export async function confirmCompanyPayment(form: FormData) {
  const { supabase } = await requirePlatformAdmin();
  const organizationId = String(form.get("organizationId") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) throw new Error("Invalid organization");
  const path = `/admin/customers/${organizationId}`;
  if (form.get("paymentVerified") !== "yes") redirect(`${path}?activationError=Confirm%20external%20payment%20verification%20first`);
  const start = Date.parse(String(form.get("periodStart") ?? "") + "T00:00:00Z");
  const end = Date.parse(String(form.get("periodEnd") ?? "") + "T00:00:00Z");
  if (!Number.isFinite(start) || !Number.isFinite(end)) redirect(`${path}?activationError=Invalid%20service%20dates`);
  const { error } = await supabase.rpc("platform_confirm_company_payment_v1", {
    p_organization_id: organizationId,
    p_invoice_reference: String(form.get("invoiceReference") ?? "").trim(),
    p_amount: Number(form.get("amount")),
    p_currency: String(form.get("currency") ?? "").toUpperCase(),
    p_period_start: new Date(start).toISOString(),
    p_period_end: new Date(end).toISOString(),
  });
  if (error) redirect(`${path}?activationError=${encodeURIComponent(error.message)}`);
  revalidatePath(path);
  revalidatePath("/activation");
  revalidatePath("/billing");
  redirect(`${path}?activation=recorded`);
}
