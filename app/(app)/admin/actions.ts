"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin/authorization";
import { executeAutomationTask } from "@/lib/admin/automation/executor";

const allowedScheduleModes = new Set(["manual", "daily", "weekly", "monthly"]);

export async function runAutomationNow(formData: FormData) {
  const { user } = await requirePlatformAdmin();
  const taskId = String(formData.get("taskId") ?? "");
  if (!taskId) throw new Error("Automation task is required.");
  await executeAutomationTask(taskId, "manual", user.id);
  revalidatePath("/admin");
  revalidatePath("/admin/automation");
}

export async function updateAutomationTask(formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();
  const taskId = String(formData.get("taskId") ?? "");
  const scheduleMode = String(formData.get("scheduleMode") ?? "manual");
  const enabled = formData.get("enabled") === "on";
  if (!taskId || !allowedScheduleModes.has(scheduleMode)) throw new Error("Invalid automation task update.");

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
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
  revalidatePath("/admin/automation");
}
