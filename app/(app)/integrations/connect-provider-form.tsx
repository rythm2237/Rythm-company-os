"use client";

import { useMemo, useState } from "react";
import { createIntegration } from "./actions";

type Provider = {
  provider_key: string;
  display_name: string;
  supports_oauth: boolean | null;
  supports_token: boolean | null;
};

export function ConnectProviderForm({ providers }: { providers: Provider[] }) {
  const [providerKey, setProviderKey] = useState(providers[0]?.provider_key ?? "");
  const selected = useMemo(
    () => providers.find((provider) => provider.provider_key === providerKey) ?? null,
    [providerKey, providers],
  );
  const isGoogleWorkspace = providerKey === "google_workspace";

  const providerSelect = (
    <label>
      Provider
      <select
        name="providerKey"
        required
        value={providerKey}
        onChange={(event) => setProviderKey(event.target.value)}
      >
        {providers.map((provider) => (
          <option key={provider.provider_key} value={provider.provider_key}>
            {provider.display_name}
          </option>
        ))}
      </select>
    </label>
  );

  if (isGoogleWorkspace) {
    return (
      <form
        action="/api/integrations/google-workspace/connect"
        method="post"
        className="stacked-form"
      >
        {providerSelect}
        <label>
          Connection name
          <input name="displayName" defaultValue="Google Workspace" required />
        </label>
        <div className="security-note">
          <strong>Google OAuth · read-only bootstrap access</strong>
          <span>
            RYTHM requests Gmail metadata and Google Calendar read access directly from Google. No API key, password, or pasted token is required.
          </span>
        </div>
        <div className="compact-list">
          <div>
            <strong>Gmail</strong>
            <span>Read-only metadata access for Company Auto-Bootstrap.</span>
          </div>
          <div>
            <strong>Google Calendar</strong>
            <span>Read-only event metadata access for Company Auto-Bootstrap.</span>
          </div>
        </div>
        <button className="primary-button" type="submit">
          Connect with Google
        </button>
      </form>
    );
  }

  return (
    <form action={createIntegration} className="stacked-form">
      {providerSelect}
      <label>
        Connection name
        <input name="displayName" placeholder="Production GitHub" required />
      </label>
      <label>
        Account / team / project reference
        <input name="accountRef" placeholder="org, team, project or account id" />
      </label>
      <label>
        Base URL (optional)
        <input name="baseUrl" placeholder="https://api.example.com" />
      </label>
      <label>
        Authentication
        <select name="authType" defaultValue={selected?.supports_oauth ? "oauth" : "token"}>
          {selected?.supports_token !== false ? <option value="token">Token / API key</option> : null}
          {selected?.supports_oauth ? <option value="oauth">OAuth</option> : null}
          <option value="service_account">Service account</option>
        </select>
      </label>
      <label>
        Granted scopes
        <input name="grantedScopes" placeholder="repo:read, pull_requests:write" />
      </label>
      <label>
        Credential
        <input
          name="secret"
          type="password"
          autoComplete="new-password"
          placeholder="Stored only in Supabase Vault"
        />
      </label>
      <button className="primary-button" type="submit">
        Create connection
      </button>
    </form>
  );
}
