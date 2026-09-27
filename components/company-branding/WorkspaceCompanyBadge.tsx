"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import CompanyLogo from "./CompanyLogo";

// Attach to the page's own header, not a separate toolbar or a floating overlay.
export default function WorkspaceCompanyBadge({ organizationId, name, version }: { organizationId: string; name: string; version?: string | null }) {
  const pathname = usePathname();
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const stage = document.querySelector(".app-page-transition");
    if (!stage) return;
    let target: HTMLElement | null = null;
    let slot: HTMLDivElement | null = null;
    const detach = () => {
      slot?.remove();
      target?.classList.remove("workspace-branded-header", "workspace-branded-fallback");
      target?.style.removeProperty("--brand-original-right");
      target?.style.removeProperty("--brand-original-top");
    };
    const attach = () => {
      const main = stage.querySelector<HTMLElement>("main");
      const next = main?.querySelector<HTMLElement>(":scope > header, :scope > .admin-hero, :scope > .page-header") ?? main;
      if (!next || (next === target && slot?.isConnected)) return;
      detach(); target = next;
      const style = getComputedStyle(target);
      target.style.setProperty("--brand-original-right", style.paddingRight);
      target.style.setProperty("--brand-original-top", style.paddingTop);
      target.classList.add(target === main ? "workspace-branded-fallback" : "workspace-branded-header");
      slot = document.createElement("div"); slot.className = "workspace-brand-host";
      target.appendChild(slot); setHost(slot);
    };
    attach();
    const observer = new MutationObserver(attach); observer.observe(stage, { childList: true, subtree: true });
    return () => { observer.disconnect(); detach(); };
  }, [pathname, organizationId]);
  return host ? createPortal(<div className="workspace-company-badge" aria-label={`Current company: ${name}`}><span title={name}>{name}</span><CompanyLogo organizationId={organizationId} name={name} version={version} /></div>, host) : null;
}
