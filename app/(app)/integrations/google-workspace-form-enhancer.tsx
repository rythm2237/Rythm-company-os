"use client";

import { useEffect } from "react";

const GOOGLE_SCOPES = "gmail.readonly,calendar.readonly";

export function GoogleWorkspaceFormEnhancer() {
  useEffect(() => {
    const select = document.querySelector<HTMLSelectElement>('form select[name="providerKey"]');
    const form = select?.closest("form");
    if (!select || !form) return;

    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])');
    const originalAction = form.getAttribute("action") || "";
    const originalMethod = form.getAttribute("method") || "post";
    const originalButtonText = submit?.textContent || "Create connection";
    const fields = ["accountRef", "baseUrl", "authType", "grantedScopes", "secret"] as const;
    const labels = new Map<string, HTMLElement | null>();
    for (const name of fields) {
      const input = form.querySelector<HTMLElement>(`[name="${name}"]`);
      labels.set(name, input?.closest("label") as HTMLElement | null);
    }

    const note = document.createElement("div");
    note.setAttribute("data-google-workspace-oauth-note", "true");
    note.className = "security-note";
    note.innerHTML =
      '<strong>Google OAuth · read-only access</strong><span>RYTHM will request Gmail metadata and Google Calendar read access directly from Google. No API key, password, or access token needs to be pasted here.</span>';
    note.style.display = "none";
    submit?.parentElement?.insertBefore(note, submit);

    const hiddenScopes = document.createElement("input");
    hiddenScopes.type = "hidden";
    hiddenScopes.name = "grantedScopes";
    hiddenScopes.value = GOOGLE_SCOPES;
    hiddenScopes.disabled = true;
    form.appendChild(hiddenScopes);

    const apply = () => {
      const google = select.value === "google_workspace";
      for (const name of fields) {
        const label = labels.get(name);
        if (label) label.style.display = google ? "none" : "";
      }
      hiddenScopes.disabled = !google;
      note.style.display = google ? "grid" : "none";
      if (google) {
        form.setAttribute("action", "/api/integrations/google-workspace/connect");
        form.setAttribute("method", "post");
        if (submit) submit.textContent = "Connect with Google";
        const displayName = form.querySelector<HTMLInputElement>('input[name="displayName"]');
        if (displayName && !displayName.value.trim()) displayName.value = "Google Workspace";
      } else {
        if (originalAction) form.setAttribute("action", originalAction);
        else form.removeAttribute("action");
        form.setAttribute("method", originalMethod);
        if (submit) submit.textContent = originalButtonText;
      }
    };

    select.addEventListener("change", apply);
    apply();
    return () => {
      select.removeEventListener("change", apply);
      note.remove();
      hiddenScopes.remove();
    };
  }, []);

  return null;
}
