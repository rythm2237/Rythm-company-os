"use client";

import { useMemo, useState } from "react";

type Provider = {
  provider_key: string;
  display_name: string;
  supports_oauth: boolean | null;
  supports_token: boolean | null;
};

export function ConnectProviderForm({ providers }: { providers: Provider[] }) {
  const initialProvider = providers[0]?.provider_key ?? "";
  const [providerKey, setProviderKey] = useState(initialProvider);
  const selected = useMemo(
    () => providers.find((provider) => provider.provider_key === providerKey) ?? null,
    [providerKey, providers],
  );
  const isGoogleWorkspace = providerKey === "google_workspace";

  return (
    <form
      action={
        isGoogleWorkspace
          ? "/api/integrations/google-workspace/connect"
          : "/api/integrations/manual/connect"
      }
      method="post"
      className="stacked-form"
    >
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

      <label>
        Connection name
        <input
          name="displayName"
          placeholder={isGoogleWorkspace ? "Company Google Workspace" : "Production GitHub"}
          defaultValue={isGoogleWorkspace ? "Google Workspace" : ""}
          required
        />
      </label>

      {isGoogleWorkspace ? (
        <>
          <div className="security-note">
            <strong>Google OAuth · read-only bootstrap access</strong>
            <span>
              RYTHM will ask Google directly for Gmail metadata and Google Calendar read access.
              You do not need to paste an API key, access token, or password.
            </span>
          </div>
          <div className="compact-list">
            <div>
              <strong>Gmail</strong>
              <span>Read-only message metadata for Company Auto-Bootstrap. Message bodies and attachments are excluded.</span>
            </div>
            <div>
              <strong>Google Calendar</strong>
              <span>Read-only event metadata. Event descriptions and locations are excluded from bootstrap collection.</span>
            </div>
          </div>
          <input type="hidden" name="authType" value="oauth" />
          <input type="hidden" name="grantedScopes" value="gmail.readonly,calendar.readonly" />
          <button className="primary-button" type="submit">
            Connect with Google
          </button>
          <p className="subtitle" style={{ margin: 0 }}>
            Google will show the exact requested permissions before anything is connected.
          </p>
        </>
      ) : (
        <>
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
        </>
      )}
    </form>
  );
}
