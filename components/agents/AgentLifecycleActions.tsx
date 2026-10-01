"use client";
import { SubmitButton } from "@/components/ui/Button";
import { setAgentStatus } from "@/app/(app)/studio/agents/actions";
function Submit({ label }: { label: string }) { return <SubmitButton loadingLabel="Saving…">{label}</SubmitButton>; }
export default function AgentLifecycleActions({ agentId, name, status, canArchive, organizationId }: { agentId: string; name: string; status: string; canArchive: boolean; organizationId: string }) {
  const action = (next: string, label: string) => <form key={next} action={setAgentStatus} onSubmit={event => {
    if ((next === "archived" || status === "archived") && !window.confirm(next === "archived" ? `Archive ${name}? It will stop running. History and financial records will be retained.` : `Restore ${name} as Disabled? Enable it separately when ready.`)) event.preventDefault();
  }}><input type="hidden" name="agentId" value={agentId}/><input type="hidden" name="organizationId" value={organizationId}/><input type="hidden" name="status" value={next}/><Submit label={label}/></form>;
  return <div className="agent-lifecycle-actions">{status === "archived" ? canArchive ? action("paused", "Restore as Disabled") : null : <>{action(status === "enabled" ? "paused" : "enabled", status === "enabled" ? "Disable" : "Enable")}{canArchive ? action("archived", "Archive") : null}</>}</div>;
}
