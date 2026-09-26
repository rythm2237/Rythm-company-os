"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { normalizeLogo } from "@/lib/company-branding/image";
export type LogoResult = { error?: string; message?: string };
export async function saveCompanyLogo(_previous: LogoResult, form: FormData): Promise<LogoResult> {
  const { supabase, organizationId } = await requireOwnerOrganizationContext();
  if (form.get("organizationId") !== organizationId) return { error: "Your active company changed. Refresh this page and try again." };
  const remove = form.get("intent") === "remove";
  let bytes: Buffer | null = null;
  if (!remove) {
    const file = form.get("logo");
    if (!(file instanceof File)) return { error: "Choose a PNG, JPEG or WebP logo." };
    try { bytes = await normalizeLogo(file); } catch { return { error: "Use a valid static PNG, JPEG or WebP up to 2 MB and 16 megapixels." }; }
  }
  const previous = await supabase.from("organization_branding").select("logo_path").eq("organization_id", organizationId).maybeSingle();
  if (previous.error) return { error: "Logo settings are temporarily unavailable." };
  const path = bytes ? `${organizationId}/${randomUUID()}.webp` : null;
  if (bytes && path) {
    const uploaded = await supabase.storage.from("company-logos").upload(path, bytes, { contentType: "image/webp", upsert: false, cacheControl: "0" });
    if (uploaded.error) return { error: "The logo could not be uploaded. Please retry." };
  }
  const saved = await supabase.from("organization_branding").upsert({ organization_id: organizationId, logo_path: path }).select("organization_id").single();
  if (saved.error) {
    if (path) await supabase.storage.from("company-logos").remove([path]);
    return { error: "The logo could not be saved. Your previous logo is unchanged." };
  }
  if (previous.data?.logo_path) await supabase.storage.from("company-logos").remove([previous.data.logo_path]);
  revalidatePath("/", "layout");
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${organizationId}`);
  return { message: remove ? "Company logo removed." : "Company logo updated." };
}
