export type RoutingMode = "off" | "shadow" | "enforced";
export type RoutingConfigScope = "global" | "environment" | "organization";

export type RoutingRolloutRow = {
  scope: RoutingConfigScope | string;
  environment: string | null;
  organization_id: string | null;
  routing_mode: RoutingMode | string;
  kill_switch: boolean;
  policy_version: string;
};

export type ResolvedRoutingRollout = {
  mode: RoutingMode;
  source: "default" | RoutingConfigScope | "kill_switch" | "invalid";
  policyVersion: string;
  killSwitchActive: boolean;
  reasonCodes: string[];
};

const MODES = new Set<RoutingMode>(["off", "shadow", "enforced"]);
const SCOPES = new Set<RoutingConfigScope>(["global", "environment", "organization"]);

function validRow(row: RoutingRolloutRow) {
  if (!SCOPES.has(row.scope as RoutingConfigScope) || !MODES.has(row.routing_mode as RoutingMode)) return false;
  if (!row.policy_version?.trim()) return false;
  if (row.scope === "global") return row.environment == null && row.organization_id == null;
  if (row.scope === "environment") return Boolean(row.environment?.trim()) && row.organization_id == null;
  return row.environment == null && Boolean(row.organization_id?.trim());
}

export function resolveRoutingRollout(input: {
  rows?: RoutingRolloutRow[] | null;
  environment: string;
  organizationId: string;
  environmentKillSwitch?: string | boolean | null;
}): ResolvedRoutingRollout {
  const killSwitchValue = input.environmentKillSwitch;
  if (killSwitchValue != null && killSwitchValue !== "" && killSwitchValue !== true && killSwitchValue !== false && killSwitchValue !== "true" && killSwitchValue !== "false") {
    return { mode: "off", source: "invalid", policyVersion: "routing-policy-v1", killSwitchActive: true, reasonCodes: ["invalid_kill_switch_configuration", "safe_fallback_off"] };
  }
  if (killSwitchValue === true || killSwitchValue === "true") {
    return { mode: "off", source: "kill_switch", policyVersion: "routing-policy-v1", killSwitchActive: true, reasonCodes: ["environment_kill_switch", "safe_fallback_off"] };
  }

  const applicable = (input.rows ?? []).filter((row) =>
    row.scope === "global"
    || (row.scope === "environment" && row.environment === input.environment)
    || (row.scope === "organization" && row.organization_id === input.organizationId));
  if (applicable.some((row) => !validRow(row))) {
    return { mode: "off", source: "invalid", policyVersion: "routing-policy-v1", killSwitchActive: true, reasonCodes: ["invalid_rollout_configuration", "safe_fallback_off"] };
  }
  if (applicable.some((row) => row.kill_switch)) {
    return { mode: "off", source: "kill_switch", policyVersion: "routing-policy-v1", killSwitchActive: true, reasonCodes: ["database_kill_switch", "safe_fallback_off"] };
  }

  const organization = applicable.find((row) => row.scope === "organization");
  const environment = applicable.find((row) => row.scope === "environment");
  const global = applicable.find((row) => row.scope === "global");
  const selected = organization ?? environment ?? global;
  if (!selected) return { mode: "off", source: "default", policyVersion: "routing-policy-v1", killSwitchActive: false, reasonCodes: ["missing_configuration", "safe_fallback_off"] };
  return {
    mode: selected.routing_mode as RoutingMode,
    source: selected.scope as RoutingConfigScope,
    policyVersion: selected.policy_version,
    killSwitchActive: false,
    reasonCodes: [`${selected.scope}_routing_mode`],
  };
}
