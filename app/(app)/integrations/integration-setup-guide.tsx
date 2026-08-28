"use client";

import { useEffect, useMemo, useState } from "react";

type Guide = { title: string; intro: string; steps: string[]; note: string };

const GUIDES: Record<string, Guide> = {
  google_workspace: {
    title: "Google Workspace",
    intro: "Use Google OAuth. RYTHM requests only the scopes needed for the selected workflow.",
    steps: [
      "Choose Google Workspace as the provider.",
      "Select Connect with Google and sign in to the company-owned Google account.",
      "Review the requested Gmail / Calendar scopes before approving.",
      "Return to RYTHM and verify the connection status is Connected.",
      "Grant only the capabilities the relevant Agents need.",
    ],
    note: "RYTHM never asks you to paste your Google password.",
  },
  generic_business_api: {
    title: "Business API / custom system",
    intro: "Use this for accounting, ERP, CRM, CMS, legal, HR or local country-specific software that exposes a secure HTTPS API.",
    steps: [
      "Copy the API base URL from your software provider.",
      "Create a dedicated API token or service credential; do not reuse a personal password.",
      "Enter a clear connection name and account / tenant reference if the provider uses one.",
      "Paste the HTTPS base URL and dedicated credential. RYTHM stores it in Vault.",
      "Start with read-only access and add write scopes only when the workflow requires them.",
      "Grant the minimum required Agent capabilities and test before enabling external writes.",
    ],
    note: "Generic connections are origin-locked: Agents cannot replace the configured API host with an arbitrary URL.",
  },
  google_ads: {
    title: "Google Ads",
    intro: "Connect the agency or client-owned Google Ads account. Campaign execution and budget authority are governed separately.",
    steps: ["Choose the correct Ads customer ID.", "Authorize reporting access first.", "Verify account and campaign visibility.", "Enable campaign publish only for responsible Agents.", "Budget and spend changes require Human CEO approval."],
    note: "Use OAuth and minimum scopes; never share a Google password.",
  },
  meta_marketing: {
    title: "Meta / Facebook / Instagram",
    intro: "Connect the correct Business Portfolio, Ad Account and Pages/Instagram accounts.",
    steps: ["Confirm the client Business Portfolio and Ad Account.", "Authorize required Meta permissions.", "Verify Page, Instagram and Ad Account visibility.", "Grant publish/campaign execution only to responsible Agents.", "Budget/spend changes require Human CEO approval."],
    note: "Meta Blueprint is training/certification; operational execution uses Meta platform APIs.",
  },
  youtube: {
    title: "YouTube",
    intro: "Connect the client-owned YouTube channel through Google OAuth for analytics and governed publishing.",
    steps: ["Choose the correct Google account/channel.", "Authorize read scopes first.", "Enable upload/publish scopes only when needed.", "Review the exact video metadata before governed publishing."],
    note: "Publishing is a consequential external action and remains approval governed.",
  },
  tiktok_business: {
    title: "TikTok for Business",
    intro: "Connect the advertiser account and publishing identity used for client content.",
    steps: ["Select the correct advertiser account.", "Authorize reporting access first.", "Verify advertiser/publishing identity.", "Enable campaign/content writes only when needed.", "Budget changes require Human CEO approval."],
    note: "Only grant scopes needed for the specific client workflow.",
  },
  linkedin_marketing: {
    title: "LinkedIn Marketing",
    intro: "Connect the client Ad Account and Organization/Page used for campaigns or publishing.",
    steps: ["Confirm the Organization/Page and Ad Account.", "Authorize reporting and verify access.", "Enable campaign/Page publishing only when needed.", "Assign capabilities using least privilege.", "Budget changes remain Human CEO controlled."],
    note: "RYTHM separates content/campaign execution authority from financial authority.",
  },
};

const DEFAULT_GUIDE: Guide = {
  title: "Connection setup",
  intro: "Connect company-owned systems with least privilege. Credentials stay in Vault and consequential actions stay governed.",
  steps: ["Select the company/client provider.", "Use OAuth, a dedicated API token or service account.", "Grant only minimum scopes.", "Verify the connection before assigning it to Agents.", "Keep financial, legal, publishing and destructive actions behind required human approval."],
  note: "Do not paste personal passwords into API-token fields.",
};

export function IntegrationSetupGuide() {
  const [providerKey, setProviderKey] = useState("");
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const select = document.querySelector<HTMLSelectElement>('select[name="providerKey"]');
    if (!select) return;
    const update = () => setProviderKey(select.value);
    update();
    select.addEventListener("change", update);
    return () => select.removeEventListener("change", update);
  }, []);
  const guide = useMemo(() => GUIDES[providerKey] ?? DEFAULT_GUIDE, [providerKey]);
  return (
    <aside aria-label="Integration connection guide" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 40, width: open ? "min(390px, calc(100vw - 40px))" : "auto", maxHeight: "72vh", overflow: "auto", border: "1px solid rgba(148,163,184,.28)", borderRadius: 16, background: "rgba(17,24,39,.94)", backdropFilter: "blur(14px)", boxShadow: "0 18px 50px rgba(0,0,0,.22)", padding: open ? 16 : 0 }}>
      {open ? <>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
          <div><p className="label" style={{ margin: 0 }}>GUIDED CONNECTION</p><h3 style={{ margin: "5px 0 8px" }}>{guide.title}</h3></div>
          <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Hide</button>
        </div>
        <p style={{ marginTop: 0, opacity: .86 }}>{guide.intro}</p>
        <ol style={{ paddingInlineStart: 22, display: "grid", gap: 8 }}>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        <div className="security-note" style={{ marginTop: 12 }}><strong>Security checkpoint</strong><span>{guide.note}</span></div>
      </> : <button type="button" className="primary-button" onClick={() => setOpen(true)}>Connection guide</button>}
    </aside>
  );
}
