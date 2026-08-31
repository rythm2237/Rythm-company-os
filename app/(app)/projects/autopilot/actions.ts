"use server";

import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { runNextInternalProjectAction } from "@/lib/project-autopilot";

export type ProjectAutopilotState = {
  status: "idle" | "running" | "completed" | "approval_required" | "error";
  message?: string;
  actionCode?: string | null;
  title?: string;
  output?: string;
  approvalId?: string;
};

export async function runNextProjectAutopilotAction(projectId: string): Promise<ProjectAutopilotState> {
  const context = await requireActiveOwnerOrganizationContext();
  try {
    const result = await runNextInternalProjectAction({
      supabase: context.supabase,
      organizationId: context.organizationId,
      userId: context.user.id,
      organizationName: context.organization.name,
    }, projectId);

    if (result.status === "completed") return { status: "completed", actionCode: result.actionCode, title: result.title, output: result.output };
    if (result.status === "approval_required") return { status: "approval_required", actionCode: result.actionCode, approvalId: result.approvalId, message: "Internal work is complete up to a Human CEO approval gate." };
    return { status: "idle", message: result.message };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Project autopilot failed." };
  }
}
