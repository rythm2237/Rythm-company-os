import type { SupabaseClient } from "@supabase/supabase-js";

export const PROJECT_WORKFLOW_STATES = [
  "INTAKE",
  "DISCOVERY",
  "DELIBERATION",
  "LEGAL_REVIEW",
  "DECISION_PENDING",
  "APPROVAL_PENDING",
  "EXECUTION",
  "BLOCKED",
  "COMPLETE",
  "CANCELLED",
] as const;

export type ProjectWorkflowState = (typeof PROJECT_WORKFLOW_STATES)[number];

export type WorkflowTimelineItem = {
  id: string;
  organization_id: string;
  project_id: string;
  occurred_at: string;
  timeline_source: "company_event" | "project_progress_event";
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  correlation_id: string | null;
  risk_level: string;
  payload: Record<string, unknown>;
};

export type EntityRelationship = {
  id: string;
  organization_id: string;
  project_id: string | null;
  source_type: string;
  source_id: string;
  relationship_type: string;
  target_type: string;
  target_id: string;
  source_event_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function refreshProjectWorkflowState(
  supabase: SupabaseClient,
  projectId: string,
  trigger?: { entityType?: string; entityId?: string; reason?: string; correlationId?: string },
): Promise<ProjectWorkflowState> {
  const { data, error } = await supabase.rpc("refresh_project_workflow_state", {
    target_project_id: projectId,
    target_trigger_entity_type: trigger?.entityType ?? null,
    target_trigger_entity_id: trigger?.entityId ?? null,
    target_reason: trigger?.reason ?? null,
    target_correlation_id: trigger?.correlationId ?? null,
  });

  if (error) throw new Error(`Workflow state refresh failed: ${error.message}`);
  if (!PROJECT_WORKFLOW_STATES.includes(data as ProjectWorkflowState)) {
    throw new Error(`Workflow resolver returned an invalid state: ${String(data)}`);
  }
  return data as ProjectWorkflowState;
}

export async function getProjectOperatingTimeline(
  supabase: SupabaseClient,
  projectId: string,
  limit = 100,
): Promise<WorkflowTimelineItem[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 250);
  const { data, error } = await supabase
    .from("project_operating_timeline")
    .select("id,organization_id,project_id,occurred_at,timeline_source,event_type,entity_type,entity_id,correlation_id,risk_level,payload")
    .eq("project_id", projectId)
    .order("occurred_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error(`Project timeline query failed: ${error.message}`);
  return (data ?? []) as WorkflowTimelineItem[];
}

export async function getProjectRelationships(
  supabase: SupabaseClient,
  projectId: string,
): Promise<EntityRelationship[]> {
  const { data, error } = await supabase
    .from("entity_relationships")
    .select("id,organization_id,project_id,source_type,source_id,relationship_type,target_type,target_id,source_event_id,metadata,created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Project relationship query failed: ${error.message}`);
  return (data ?? []) as EntityRelationship[];
}
