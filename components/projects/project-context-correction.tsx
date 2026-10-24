"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { BUSINESS_CONTEXT_CORRECTION_FIELDS } from "@/lib/projects/project-intelligence";

export function ProjectContextCorrection({ projectId }: { projectId: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const router = useRouter();
  async function save(formData: FormData) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/projects/context", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, key: formData.get("key"), value: formData.get("value") }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The correction could not be saved.");
      setMessage("Correction saved as approved Project Knowledge. Run analysis again to update the findings and draft plan.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The correction could not be saved."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <details><summary>Correct or confirm business context</summary><form action={save} className="auth-form"><label>Business context field<select name="key">{BUSINESS_CONTEXT_CORRECTION_FIELDS.map(key => <option key={key} value={key}>{key.replaceAll("_", " ")}</option>)}</select></label><label>Confirmed information<textarea name="value" required maxLength={2000} rows={3}/></label><p className="security-note">Use operational business context only. Keep financial values, contract terms and credentials in their protected records.</p><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save confirmed context"}</Button>{message ? <p role="status">{message} <a href={`/projects/operating?project=${encodeURIComponent(projectId)}&view=roadmap`}>Open Roadmap to rerun analysis and request a revised plan.</a></p> : null}</form></details>;
}
