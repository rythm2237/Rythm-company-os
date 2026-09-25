"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/admin/authorization";
import { submitIndexNow } from "@/lib/integrations/adapters/indexnow";
import { redactSecretText } from "@/lib/security/redaction";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const INDEXNOW_ADMIN_PATH = "/admin/seo/indexnow";

function parseUrls(formData: FormData) {
  const homepageOnly = formData.get("homepageOnly") === "1";
  if (homepageOnly) return ["https://rythm-os.com/"];

  return String(formData.get("urls") ?? "")
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function submitIndexNowFromAdmin(formData: FormData) {
  const { user } = await requirePlatformAdmin();
  const urls = parseUrls(formData);

  let destination: string;

  try {
    const result = await submitIndexNow(urls);
    const now = new Date().toISOString();
    const adminSupabase = createServerSupabaseClient();

    if (!adminSupabase) {
      throw new Error("Submission succeeded but audit logging is unavailable because the server admin client is not configured.");
    }

    const { error: auditError } = await adminSupabase.from("audit_events").insert({
      organization_id: null,
      actor_type: "user",
      actor_user_id: user.id,
      event_type: "seo.indexnow_submission",
      object_type: "seo_submission",
      object_id: "indexnow",
      risk_level: "low",
      payload: {
        provider_key: "indexnow",
        submitted: result.submitted,
        provider_status: result.status,
        accepted: result.accepted,
        occurred_at: now,
        source: "admin_indexnow_console",
      },
    });

    if (auditError) throw new Error(`Submission succeeded but audit logging failed: ${auditError.message}`);

    revalidatePath(INDEXNOW_ADMIN_PATH);
    const message = result.accepted
      ? `IndexNow accepted ${result.submitted} URL${result.submitted === 1 ? "" : "s"} with HTTP ${result.status}.`
      : `IndexNow returned HTTP ${result.status} for ${result.submitted} submitted URL${result.submitted === 1 ? "" : "s"}.`;
    destination = `${INDEXNOW_ADMIN_PATH}?message=${encodeURIComponent(message)}`;
  } catch (error) {
    const message = redactSecretText(error instanceof Error ? error.message : "IndexNow submission failed.");
    destination = `${INDEXNOW_ADMIN_PATH}?error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}
