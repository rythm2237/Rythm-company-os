"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/admin/authorization";
import { executeAutomationTask } from "@/lib/admin/automation/executor";
import { redactSecretText } from "@/lib/security/redaction";

const allowedScheduleModes = new Set(["manual", "daily", "weekly", "monthly"]);

export async function runAutomationNow(formData: FormData) {
  const { user } = await requirePlatformAdmin();
  const taskId = String(formData.get("taskId") ?? "");
  if (!taskId) redirect("/admin/automation?error=Automation%20task%20is%20required.");
  let result: Awaited<ReturnType<typeof executeAutomationTask>>;
  try {
    result = await executeAutomationTask(taskId, "manual", user.id);
  } catch (error) {
    redirect(`/admin/automation?error=${encodeURIComponent(redactSecretText(error instanceof Error ? error.message : "Automation execution failed."))}`);
  }
  revalidatePath("/admin");
  revalidatePath("/admin/automation");
  redirect(`/admin/automation?message=${encodeURIComponent(result.summary || `Automation ${result.status || "completed"}.`)}`);
}

export async function updateAutomationTask(formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();
  const taskId = String(formData.get("taskId") ?? "");
  const scheduleMode = String(formData.get("scheduleMode") ?? "manual");
  const enabled = formData.get("enabled") === "on";
  if (!taskId || !allowedScheduleModes.has(scheduleMode)) redirect("/admin/automation?error=Invalid%20automation%20task%20update.");

  const now = new Date();
  const next = new Date(now);
  if (scheduleMode === "daily") next.setUTCDate(next.getUTCDate() + 1);
  else if (scheduleMode === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else if (scheduleMode === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);

  const { error } = await supabase.from("automation_tasks").update({
    enabled,
    schedule_mode: scheduleMode,
    next_run_at: enabled && scheduleMode !== "manual" ? next.toISOString() : null,
    updated_by: user.id,
    updated_at: now.toISOString(),
  }).eq("id", taskId);
  if (error) redirect(`/admin/automation?error=${encodeURIComponent(redactSecretText(error.message))}`);

  revalidatePath("/admin");
  revalidatePath("/admin/automation");
  redirect("/admin/automation?message=Automation%20schedule%20updated.");
}
