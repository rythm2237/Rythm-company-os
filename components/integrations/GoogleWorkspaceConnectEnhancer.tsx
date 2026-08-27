"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const HIDE_FIELDS = ["accountRef", "baseUrl", "authType", "grantedScopes", "secret"];

export default function GoogleWorkspaceConnectEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/integrations") return;

    const provider = document.querySelector<HTMLSelectElement>(
      'form.stacked-form select[name="providerKey"]',
    );
    const form = provider?.closest<HTMLFormElement>("form");
    if (!provider || !form) return;

    const displayName = form.querySelector<HTMLInputElement>('input[name="displayName"]');
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');

    const sync = () => {
      const google = provider.value === "google_workspace";

      for (const name of HIDE_FIELDS) {
        const field = form.querySelector<HTMLElement>(`[name="${name}"]`);
        const label = field?.closest<HTMLElement>("label");
        if (label) label.hidden = google;
      }

      if (google && displayName && !displayName.value.trim()) {
        displayName.value = "Google Workspace";
      }
      if (submit) submit.textContent = google ? "Connect with Google" : "Create connection";

      let note = form.querySelector<HTMLElement>("[data-google-workspace-oauth-note]");
      if (google && !note) {
        note = document.createElement("div");
        note.dataset.googleWorkspaceOauthNote = "true";
        note.className = "security-note";
        note.innerHTML =
          "<strong>Google OAuth · read-only access</strong><span>No API key, password, or pasted token is required. RYTHM requests Gmail and Google Calendar read-only access directly from Google.</span>";
        submit?.before(note);
      } else if (!google && note) {
        note.remove();
      }
    };

    const onSubmit = (event: SubmitEvent) => {
      if (provider.value !== "google_workspace") return;
      event.preventDefault();

      const oauthForm = document.createElement("form");
      oauthForm.method = "post";
      oauthForm.action = "/api/integrations/google-workspace/connect";

      const name = document.createElement("input");
      name.type = "hidden";
      name.name = "displayName";
      name.value = displayName?.value.trim() || "Google Workspace";
      oauthForm.append(name);

      document.body.append(oauthForm);
      oauthForm.submit();
    };

    provider.addEventListener("change", sync);
    form.addEventListener("submit", onSubmit);
    sync();

    return () => {
      provider.removeEventListener("change", sync);
      form.removeEventListener("submit", onSubmit);
    };
  }, [pathname]);

  return null;
}
