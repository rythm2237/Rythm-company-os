"use client";

import { Button } from "@/components/ui/Button";
import { useActionState } from "react";
import { saveCompanyLogo } from "@/app/(app)/company/profile/logo-actions";
import CompanyLogo from "./CompanyLogo";
export default function CompanyLogoForm({ organizationId, name, version }: { organizationId: string; name: string; version?: string | null }) {
  const [state, action, pending] = useActionState(saveCompanyLogo, {});
  return <section className="panel ops-section company-branding-panel">
    <div><p className="label">COMPANY BRANDING</p><h2>Your company logo</h2><p>Shown at the top right of your workspace and in the platform administrator&apos;s customer list. Only company members and authorized platform administrators can view it.</p></div>
    <div className="company-logo-editor"><CompanyLogo organizationId={organizationId} name={name} version={version} size={88} />
      <form action={action}><input type="hidden" name="organizationId" value={organizationId} />
        <label htmlFor="company-logo-file">Upload or replace logo</label><input id="company-logo-file" name="logo" type="file" accept="image/png,image/jpeg,image/webp" disabled={pending} aria-describedby="company-logo-help" />
        <small id="company-logo-help">PNG, JPEG or WebP · maximum 2 MB · transparent backgrounds supported</small>
        <div className="company-logo-buttons"><Button type="submit" className="primary-button" name="intent" value="upload" disabled={pending}>{pending ? "Saving…" : "Save logo"}</Button>{version ? <Button type="submit" className="secondary-button" name="intent" value="remove" disabled={pending}>Remove logo</Button> : null}</div>
        {state.error ? <p role="alert" className="form-error">{state.error}</p> : null}{state.message ? <p role="status" className="ops-message">{state.message}</p> : null}
      </form></div>
  </section>;
}
