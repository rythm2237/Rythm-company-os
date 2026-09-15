"use client";

import { useEffect, useMemo, useState } from "react";

type Guide = { title: string; intro: string; steps: string[]; note: string; targets: string[] };
type GuideEventDetail = { providerKey?: string; open?: boolean; step?: number };

const STORAGE_KEY = "rythm.integrationGuide.v2";
const commonTargets = [
  '[data-guide-target="provider"]',
  '[data-guide-target="display-name"]',
  '[data-guide-target="start-setup"]',
  '[data-guide-target="credential"]',
  '[data-guide-target="verify"]',
];

const GUIDES: Record<string, Guide> = {
  github: { title: "GitHub", intro: "Connect the repositories this company or project is allowed to use.", steps: ["Choose GitHub and give the connection a recognizable company/client name.", "Create the company connection and continue setup.", "In GitHub, create a fine-grained token for only the repositories RYTHM needs. Start read-only while validating the project.", "Paste the provider-issued token in the secure credential field. Never use your GitHub password.", "Save it, return to Connections, and confirm verification before binding a repository to a project."], note: "Prefer fine-grained, least-privilege access. Production writes, merges and destructive actions remain governed separately.", targets: commonTargets },
  vercel: { title: "Vercel", intro: "Connect the Vercel account that owns the project deployments RYTHM may observe or operate.", steps: ["Choose Vercel and name the connection.", "Create the company connection and continue setup.", "Create a restricted Vercel token for the intended team/account.", "Paste the token in the secure field and save it to Vault.", "Verify the connection, then select the exact Vercel project when binding it to a RYTHM project."], note: "Deployment reads can be automatic; production deployment authority is governed independently.", targets: commonTargets },
  supabase: { title: "Supabase", intro: "Connect the Supabase project used by the client or internal product.", steps: ["Choose Supabase and name the connection.", "Create the connection and continue setup.", "Use a project/account credential limited to the intended Supabase resource.", "Store the provider-issued credential securely in RYTHM.", "Verify access and bind only the intended project/resource to the RYTHM project."], note: "Database schema changes and production writes are higher-risk capabilities and should not inherit read-only authority.", targets: commonTargets },
  cloudflare: { title: "Cloudflare", intro: "Connect only the account or zone this company is expected to manage.", steps: ["Choose Cloudflare and give the connection a recognizable name.", "Create the company connection and continue setup.", "Create a Cloudflare API token restricted to the intended account/zone and minimum permissions.", "Paste the token into the secure credential field.", "Verify the connection before granting DNS or edge-change capabilities to a project."], note: "Avoid Global API Keys. Use scoped API tokens and keep DNS changes approval-governed.", targets: commonTargets },
  google_workspace: { title: "Google Workspace", intro: "Connect the company Google account through the normal Google sign-in flow.", steps: ["Choose Google Workspace.", "Give the connection a familiar name.", "Select Connect with Google.", "Sign in on Google and review the requested read-only company access.", "Return to RYTHM and confirm the service shows Connected."], note: "RYTHM never asks for your Google password.", targets: commonTargets },
  google_search_console: { title: "Google Search Console", intro: "Connect the Search Console property used for SEO evidence and monitoring.", steps: ["Choose Google Search Console and name the connection for the client/site.", "Start secure Google authorization.", "Sign in with an account that can access the intended Search Console property.", "Select or confirm the exact site/property for this project.", "Return to RYTHM, verify read access, and bind that property to the project."], note: "Use read-only access by default. Sitemap submission or other consequential actions should be separate governed capabilities.", targets: commonTargets },
  google_analytics: { title: "Google Analytics 4", intro: "Connect the GA4 property used to measure traffic and conversion outcomes.", steps: ["Choose Google Analytics 4 and name the connection.", "Start secure Google authorization.", "Sign in with an account that can access the intended GA4 account/property.", "Select the exact property/data stream for the client project.", "Return to RYTHM and verify that read-only analytics evidence is available."], note: "Analytics access should be read-only for normal project analysis.", targets: commonTargets },
  google_drive: { title: "Google Drive", intro: "Connect the company or client Drive used for project documents and deliverables.", steps: ["Choose Google Drive and name the connection.", "Start secure Google authorization.", "Sign in with the intended company/client account.", "Choose only the folder or shared drive the project requires.", "Verify access and bind that resource to the project."], note: "Prefer folder/resource-level scope rather than broad access to an entire Drive.", targets: commonTargets },
  google_ads: { title: "Google Ads", intro: "Connect the agency or client-owned Google Ads account. Campaign authority stays separate from spending authority.", steps: ["Choose Google Ads and name the client/agency connection.", "Start secure Google authorization.", "Sign in to the correct Google account and select the intended Ads account.", "Verify account access in RYTHM.", "Bind it to the project; publishing and budget capabilities are granted separately."], note: "Budget/spend changes remain Human-controlled unless an explicit policy says otherwise.", targets: commonTargets },
  meta_marketing: { title: "Meta / Facebook / Instagram", intro: "Connect the Business Portfolio used for advertising or publishing.", steps: ["Choose Meta Marketing and name the client connection.", "Start secure setup.", "Sign in to Meta and select the correct business assets.", "Confirm the exact Page/Ad Account resources for the project.", "Verify the connection before enabling publishing or campaign actions."], note: "Publishing and campaign actions remain governed; spending requires Human approval.", targets: commonTargets },
  youtube: { title: "YouTube", intro: "Connect the company or client YouTube channel through Google authorization.", steps: ["Choose YouTube and name the channel connection.", "Start secure setup.", "Select the correct Google/YouTube account.", "Confirm the intended channel/resource.", "Verify the connection before uploads or publishing are enabled."], note: "Video publishing is a governed external action.", targets: commonTargets },
  tiktok_business: { title: "TikTok for Business", intro: "Connect the intended advertiser or publishing account.", steps: ["Choose TikTok for Business and name the client connection.", "Start secure setup.", "Sign in and choose the correct business account.", "Confirm the intended advertiser/publishing resource.", "Verify before campaign or content actions are enabled."], note: "Budget changes remain Human-controlled.", targets: commonTargets },
  linkedin_marketing: { title: "LinkedIn Marketing", intro: "Connect the client Organization/Page and advertising account.", steps: ["Choose LinkedIn Marketing and name the client connection.", "Start secure setup.", "Sign in and select the relevant organization/account.", "Confirm the exact Page or Ads resource for this project.", "Verify before campaign or Page publishing is enabled."], note: "RYTHM separates publishing authority from financial authority.", targets: commonTargets },
  website_cms: { title: "Website / CMS", intro: "Connect the CMS or website administration surface required by the project.", steps: ["Choose Website / CMS and name the site connection.", "Create the company connection.", "Use the provider's OAuth flow or a restricted application credential when prompted.", "Limit access to the intended site/environment.", "Verify access before allowing content or production changes."], note: "Content drafts and production publishing should be separate capabilities when the provider supports them.", targets: commonTargets },
  figma: { title: "Figma", intro: "Connect the design workspace or file required for the project.", steps: ["Choose Figma and name the client/workspace connection.", "Start secure authorization.", "Select the intended workspace/team.", "Confirm only the files/projects needed for this work.", "Verify and bind the selected design resource to the project."], note: "Design access should not implicitly grant unrelated workspace access.", targets: commonTargets },
  ahrefs: { title: "Ahrefs", intro: "Connect SEO research data when the project or plan includes an Ahrefs subscription.", steps: ["Choose Ahrefs and name the connection.", "Create the connection and continue setup.", "Use the provider-issued API credential for the intended account.", "Store it securely and verify access.", "Bind the relevant site/project to the RYTHM project."], note: "Ahrefs is usually optional/recommended evidence; absence should not block unrelated project work.", targets: commonTargets },
  semrush: { title: "Semrush", intro: "Connect SEO/market research data when the client or company has access.", steps: ["Choose Semrush and name the connection.", "Create the connection and continue setup.", "Use the provider-issued credential for the intended account.", "Store it securely and verify access.", "Bind only the relevant domain/project to the RYTHM project."], note: "Semrush is normally optional/recommended, not a universal blocker.", targets: commonTargets },
};

const DEFAULT_GUIDE: Guide = { title: "Connect a company service", intro: "RYTHM keeps connection setup understandable while preserving real provider verification and least-privilege access.", steps: ["Choose the service your company or project uses.", "Give the connection a name you will recognize.", "Start secure setup.", "Follow the provider authorization or restricted credential flow.", "Return to RYTHM, verify the connection, then bind only the resource needed by the project."], note: "Passwords are never requested. Connection, resource scope and action permissions are separate layers.", targets: commonTargets };

function readStored() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null") as { providerKey?: string; open?: boolean; step?: number } | null; } catch { return null; }
}

export function IntegrationSetupGuide() {
  const [providerKey, setProviderKey] = useState("");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const stored = readStored();
    if (stored) { setProviderKey(stored.providerKey || ""); setOpen(Boolean(stored.open)); setStep(Number.isFinite(stored.step) ? Number(stored.step) : 0); }
    const marker = document.querySelector<HTMLElement>("[data-integration-guide-provider]");
    if (marker?.dataset.integrationGuideProvider) setProviderKey(marker.dataset.integrationGuideProvider);
    const select = document.querySelector<HTMLSelectElement>('select[name="providerKey"]');
    const update = () => { if (select?.value) { setProviderKey(select.value); setStep(0); } };
    update();
    select?.addEventListener("change", update);
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<GuideEventDetail>).detail || {};
      if (detail.providerKey) setProviderKey(detail.providerKey);
      if (Number.isFinite(detail.step)) setStep(Number(detail.step));
      setOpen(detail.open !== false);
    };
    window.addEventListener("rythm:integration-guide", onOpen as EventListener);
    return () => { select?.removeEventListener("change", update); window.removeEventListener("rythm:integration-guide", onOpen as EventListener); };
  }, []);

  useEffect(() => {
    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ providerKey, open, step })); } catch { /* session storage is optional */ }
  }, [providerKey, open, step]);

  const guide = useMemo(() => GUIDES[providerKey] ?? DEFAULT_GUIDE, [providerKey]);
  const safeStep = Math.min(Math.max(step, 0), guide.steps.length - 1);

  function showTarget() {
    const selector = guide.targets[Math.min(safeStep, guide.targets.length - 1)];
    if (!selector) return;
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.focus?.({ preventScroll: true });
    element.dataset.guideHighlighted = "true";
    window.setTimeout(() => delete element.dataset.guideHighlighted, 2200);
  }

  if (!open) return <aside className="integration-guide" aria-label="Integration connection guide"><button type="button" onClick={() => setOpen(true)} className="integration-guide-launch">Guide this connection</button></aside>;

  return <aside className="integration-guide is-open" aria-label="Integration connection guide" aria-live="polite">
    <div className="integration-guide-head"><div><p>GUIDED CONNECTION · {safeStep + 1}/{guide.steps.length}</p><h3>{guide.title}</h3></div><button type="button" aria-label="Close connection guide" onClick={() => setOpen(false)}>Close</button></div>
    <p className="integration-guide-intro">{guide.intro}</p>
    <div className="integration-guide-progress" role="progressbar" aria-valuemin={1} aria-valuemax={guide.steps.length} aria-valuenow={safeStep + 1}><span style={{ width: `${((safeStep + 1) / guide.steps.length) * 100}%` }} /></div>
    <div className="integration-guide-step"><strong>Step {safeStep + 1}</strong><span>{guide.steps[safeStep]}</span></div>
    <div className="integration-guide-actions"><button type="button" onClick={showTarget} className="integration-guide-primary">Show me where</button>{safeStep > 0 ? <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))}>Back</button> : null}<button type="button" onClick={() => setStep((value) => Math.min(guide.steps.length - 1, value + 1))} disabled={safeStep === guide.steps.length - 1}>Next</button></div>
    <div className="integration-guide-note"><strong>Security checkpoint</strong><span>{guide.note}</span></div>
    <p className="integration-guide-persistence">This guide stays open while you work and across Integration setup pages until you explicitly close it.</p>
  </aside>;
}
