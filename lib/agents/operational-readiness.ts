export type OperationalReadinessState =
  | "not_ready"
  | "ready_with_supervision"
  | "ready_limited"
  | "ready_independent";

export type OperationalReadiness = {
  agent_id: string;
  readiness_state: OperationalReadinessState;
  readiness_score: number;
  position_contract_approved: boolean;
  autonomy_level: number;
  autonomy_status: string;
  verified_work_count: number;
  successful_work_count: number;
  failed_work_count: number;
  verified_work_success_rate: number;
  agent_run_success_count: number;
  agent_run_failure_count: number;
  agent_tool_success_count: number;
  agent_tool_failure_count: number;
  ai_task_execution_success_count: number;
  ai_task_execution_failure_count: number;
  verified_external_action_count: number;
  validated_experience_count: number;
  evaluation_pass_count: number;
  governance_violation_count: number;
  blockers: Array<{ code: string; message: string; count?: number }>;
  evidence_policy: string;
};

export const EMPTY_OPERATIONAL_READINESS: Omit<OperationalReadiness, "agent_id"> = {
  readiness_state: "not_ready",
  readiness_score: 0,
  position_contract_approved: false,
  autonomy_level: 0,
  autonomy_status: "locked",
  verified_work_count: 0,
  successful_work_count: 0,
  failed_work_count: 0,
  verified_work_success_rate: 0,
  agent_run_success_count: 0,
  agent_run_failure_count: 0,
  agent_tool_success_count: 0,
  agent_tool_failure_count: 0,
  ai_task_execution_success_count: 0,
  ai_task_execution_failure_count: 0,
  verified_external_action_count: 0,
  validated_experience_count: 0,
  evaluation_pass_count: 0,
  governance_violation_count: 0,
  blockers: [],
  evidence_policy:
    "Operational execution and independently verified outcomes are required.",
};

export function operationalReadinessLabel(state?: string | null) {
  switch (state) {
    case "ready_independent":
      return "Ready · independent low-risk work";
    case "ready_limited":
      return "Ready · limited position scope";
    case "ready_with_supervision":
      return "Ready with supervision";
    default:
      return "Not operationally ready";
  }
}

export function operationalReadinessTone(state?: string | null) {
  if (state === "ready_independent" || state === "ready_limited") return "ready";
  if (state === "ready_with_supervision") return "supervised";
  return "notReady";
}

export function asOperationalReadiness(
  value: unknown,
  agentId: string,
): OperationalReadiness {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { agent_id: agentId, ...EMPTY_OPERATIONAL_READINESS };
  }
  const record = value as Partial<OperationalReadiness>;
  return {
    agent_id: String(record.agent_id ?? agentId),
    ...EMPTY_OPERATIONAL_READINESS,
    ...record,
    blockers: Array.isArray(record.blockers) ? record.blockers : [],
  };
}
