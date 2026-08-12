"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ExecuteValidationButton({ runId, disabled }: { runId: string; disabled: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function execute() {
    setState("running");
    setMessage("");
    try {
      const response = await fetch("/api/runtime/execute-validation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const body = await response.json() as { ok?: boolean; error?: string; status?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || "Validation execution failed.");
      setState("done");
      setMessage(`Run ${body.status ?? "completed"}.`);
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Validation execution failed.");
      router.refresh();
    }
  }

  return (
    <div>
      <button type="button" onClick={execute} disabled={disabled || state === "running"}>
        {state === "running" ? "Executing controlled dry-run…" : "Execute validation dry-run"}
      </button>
      {message ? <p className={state === "error" ? "form-error" : "form-success"}>{message}</p> : null}
    </div>
  );
}
