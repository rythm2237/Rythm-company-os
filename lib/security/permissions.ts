export const CANONICAL_ACTION_CLASSES = [
  "read",
  "create",
  "update",
  "send",
  "delete",
  "publish",
  "financial",
  "external_communication",
  "destructive",
  "privileged",
] as const;

export type CanonicalActionClass = (typeof CANONICAL_ACTION_CLASSES)[number];

const CANONICAL = new Set<string>(CANONICAL_ACTION_CLASSES);
const LEGACY: Record<string, CanonicalActionClass[]> = {
  view: ["read"],
  list: ["read"],
  search: ["read"],
  inspect: ["read"],
  write: ["create", "update"],
  edit: ["update"],
  execute: ["privileged"],
  external_action: ["external_communication", "privileged"],
  email_send: ["send", "external_communication"],
  message_send: ["send", "external_communication"],
  refund: ["financial"],
  payout: ["financial"],
  merge: ["update", "publish"],
  deploy: ["publish", "privileged"],
};

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function canonicalActionsForPermission(permission: string): CanonicalActionClass[] {
  const key = normalized(permission);
  if (!key) return [];
  if (key === "*") return [...CANONICAL_ACTION_CLASSES];
  if (CANONICAL.has(key)) return [key as CanonicalActionClass];
  if (LEGACY[key]) return LEGACY[key];

  const segments = key.split(/[.:/]/).filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (CANONICAL.has(segment)) return [segment as CanonicalActionClass];
    if (LEGACY[segment]) return LEGACY[segment];
  }
  return [];
}

export function expandCanonicalPermissions(permissions: readonly string[] | null | undefined) {
  const actions = new Set<CanonicalActionClass>();
  for (const permission of permissions ?? []) {
    for (const action of canonicalActionsForPermission(permission)) actions.add(action);
  }
  return actions;
}

export type PermissionDecision = {
  allowed: boolean;
  requestedAction: CanonicalActionClass | null;
  reason: string;
  matchedPermissions: CanonicalActionClass[];
};

export function evaluateCanonicalPermission(
  permissions: readonly string[] | null | undefined,
  requested: string,
): PermissionDecision {
  const requestedActions = canonicalActionsForPermission(requested);
  if (requestedActions.length !== 1) {
    return { allowed: false, requestedAction: null, reason: "Unknown or ambiguous permission defaults to deny.", matchedPermissions: [] };
  }
  const requestedAction = requestedActions[0];
  const granted = expandCanonicalPermissions(permissions);
  return granted.has(requestedAction)
    ? { allowed: true, requestedAction, reason: "Canonical permission granted.", matchedPermissions: [...granted] }
    : { allowed: false, requestedAction, reason: "Required canonical permission is missing.", matchedPermissions: [...granted] };
}
