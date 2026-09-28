"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { analyzeProjectOS } from "@/lib/projects/project-operating-system";
import { createProjectRoadmapDraft } from "@/lib/projects/project-roadmap";

export async function submitCompanyRequest(formData: FormData) {
  const objective = String(formData.get("request") ?? "").trim().slice(0, 5000);
  if (objective.length < 3) redirect("/home?error=Describe%20what%20you%20would%20like%20RYTHM%20to%20do.");
  const { supabase, organizationId, user } = await requireOwnerOrganizationContext();
  const projectCode = `PROJECT-${randomUUID().slice(0, 8).toUpperCase()}`;
  const { data: project, error } = await supabase.from("projects").insert({
    organization_id: organizationId, project_code: projectCode, name: objective.slice(0, 120),
    objective, description: objective, project_type: "business_project", status: "planning",
    stage: "intake", priority: 3, owner_type: "human_ceo", scope: {}, success_criteria: [],
    constraints: ["Human approval is required for consequential external actions"],
    progress_percent: 0, readiness_score: 0, created_by_user_id: user.id,
    autonomy_mode: "approval_required", tags: [],
  }).select("id").single();
  if (error || !project) redirect("/home?error=RYTHM%20could%20not%20save%20your%20request.");

  await supabase.from("audit_events").insert({
    organization_id: organizationId, actor_type: "user", actor_user_id: user.id,
    event_type: "project.created", object_type: "project", object_id: project.id,
    risk_level: "low", payload: { source: "home_command", project_code: projectCode },
  });

  // Plan before execution. A failed AI analysis leaves an honest, recoverable planning project.
  let planningError = false;
  const service = createServerSupabaseClient();
  if (service) {
    try {
      await analyzeProjectOS(service, organizationId, project.id);
      await createProjectRoadmapDraft(service, organizationId, project.id, user.id);
    } catch (cause) {
      planningError = true;
      console.error("home_project_planning_failed", { projectId: project.id, cause });
    }
  } else planningError = true;
  revalidatePath("/projects");
  redirect(`/projects/operating?project=${project.id}${planningError ? "&planning=retry" : "&view=roadmap"}`);
}
