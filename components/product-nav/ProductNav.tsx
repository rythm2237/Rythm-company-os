"use client";

import { Button } from "@/components/ui/Button";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { switchOrganization } from "@/app/organization-context/actions";
import RythmBrandLogo from "@/components/brand/RythmBrandLogo";
import { logout } from "@/components/app-shell/actions";

const groups = [
  { label: "Workspace", items: [
    { label: "Home", href: "/home", icon: "⌂" },
    { label: "Projects", href: "/projects", icon: "◇" },
    { label: "Inbox", href: "/inbox", icon: "✉" },
    { label: "My AI Company", href: "/company", icon: "▣" },
    { label: "Reports", href: "/reports", icon: "▥" },
  ]},
  { label: "", items: [{ label: "Settings", href: "/settings", icon: "⚙" }] },
  { label: "Platform", items: [{ label: "Admin", href: "/admin", icon: "◆" }] },
] as const;

const legacySections: Record<string, string[]> = {
  "/home": ["/command-center", "/ai"],
  "/inbox": ["/attention", "/approvals", "/decisions"],
  "/company": ["/agents", "/studio/agents", "/studio/templates", "/studio/builder", "/meetings", "/company-library"],
  "/reports": ["/executive-review", "/finance", "/operations", "/agency/seo", "/evaluations"],
  "/settings": ["/integrations", "/notifications", "/billing"],
};

const productLabel: Record<string, string> = { ready_company: "Ready Company", custom_company: "Custom Company", company_studio: "Company Studio" };
const DESKTOP_NAV_STORAGE_KEY = "rythm_workspace_nav_collapsed";

type Props = {
  access: { active: boolean; agentStudio: boolean; templates: boolean; companyBuilder: boolean; companyLaunch: boolean; platformAdmin: boolean };
  organization: { activeOrganizationId: string; activeOrganizationName: string; activeRole: string; userName: string; userEmail?: string; productCode?: string | null; entitlementStatus?: string | null; organizations: Array<{ id: string; name: string; role: string }> } | null;
};

function isRouteActive(pathname: string, href: string) {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  if (href === "/admin" && pathname.startsWith("/admin/")) return true;
  return (legacySections[href] ?? []).some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function canShowItem(href: string, access: Props["access"]) {
  if (href.startsWith("/admin")) return access.platformAdmin;
  if (href === "/studio/agents") return access.agentStudio;
  if (href === "/studio/templates") return access.templates;
  if (href === "/studio/builder") return access.companyBuilder;
  if (href === "/company/launch") return access.companyLaunch;
  return true;
}

function isAIWorkspacePath(pathname: string) {
  return pathname === "/ai" || pathname.startsWith("/ai/");
}

export default function ProductNav({ access, organization }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [desktopPreferenceLoaded, setDesktopPreferenceLoaded] = useState(false);
  const aiAutoCollapseActive = useRef(false);
  const preAiCollapsedPreference = useRef(false);

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    try {
      const storedCollapsed = window.localStorage.getItem(DESKTOP_NAV_STORAGE_KEY) === "1";
      preAiCollapsedPreference.current = storedCollapsed;
      if (isAIWorkspacePath(pathname)) {
        aiAutoCollapseActive.current = true;
        setDesktopCollapsed(true);
      } else {
        setDesktopCollapsed(storedCollapsed);
      }
    } catch {
      preAiCollapsedPreference.current = false;
      if (isAIWorkspacePath(pathname)) {
        aiAutoCollapseActive.current = true;
        setDesktopCollapsed(true);
      } else {
        setDesktopCollapsed(false);
      }
    } finally {
      setDesktopPreferenceLoaded(true);
    }
  }, []);
  useEffect(() => {
    if (!desktopPreferenceLoaded) return;
    const inAIWorkspace = isAIWorkspacePath(pathname);
    if (inAIWorkspace && !aiAutoCollapseActive.current) {
      preAiCollapsedPreference.current = desktopCollapsed;
      aiAutoCollapseActive.current = true;
      setDesktopCollapsed(true);
      return;
    }
    if (!inAIWorkspace && aiAutoCollapseActive.current) {
      aiAutoCollapseActive.current = false;
      setDesktopCollapsed(preAiCollapsedPreference.current);
    }
  }, [desktopCollapsed, desktopPreferenceLoaded, pathname]);
  useEffect(() => {
    if (!desktopPreferenceLoaded) return;
    document.documentElement.classList.toggle("rythm-nav-collapsed", desktopCollapsed);
    if (!aiAutoCollapseActive.current) {
      preAiCollapsedPreference.current = desktopCollapsed;
      try { window.localStorage.setItem(DESKTOP_NAV_STORAGE_KEY, desktopCollapsed ? "1" : "0"); } catch { /* storage may be unavailable */ }
    }
    return () => document.documentElement.classList.remove("rythm-nav-collapsed");
  }, [desktopCollapsed, desktopPreferenceLoaded]);

  const visibleGroups = groups.map((group) => ({ ...group, items: group.items.filter((item) => canShowItem(item.href, access)) })).filter((group) => group.items.length > 0);

  return <div className={`app-navigation${mobileOpen ? " is-open" : ""}${desktopCollapsed ? " is-desktop-collapsed" : ""}`}>
    <button className="app-nav-backdrop" type="button" aria-label="Close workspace navigation" onClick={() => setMobileOpen(false)} />
    <nav className="product-nav" id="workspace-navigation" aria-label="RYTHM workspace navigation">
      <div className="product-nav-inner">
        <div className="product-nav-topline">
          <Link className="product-brand" href="/home" aria-label="RYTHM Home">
            <RythmBrandLogo className="product-brand-full" priority variant="inverse" />
            <Image className="product-brand-compact" src="/brand/mark-inverse.svg" width={38} height={38} alt="RYTHM" priority />
          </Link>
          <Button iconOnly className="product-nav-collapse" type="button" aria-label={desktopCollapsed ? "Expand workspace navigation" : "Collapse workspace navigation"} aria-pressed={desktopCollapsed} title={desktopCollapsed ? "Expand navigation" : "Collapse navigation"} onClick={() => setDesktopCollapsed(value => !value)}>{desktopCollapsed ? "›" : "‹"}</Button>
          <Button iconOnly className="product-nav-close" type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation">×</Button>
        </div>
        <div className="product-nav-groups">{visibleGroups.map((group) => <div className="product-nav-group" key={group.label}>{group.label ? <span className="product-nav-label">{group.label}</span> : null}<div className="product-nav-links">{group.items.map((item) => { const active = isRouteActive(pathname, item.href); return <Link key={item.href} href={item.href} title={desktopCollapsed ? item.label : undefined} className={active ? "product-nav-link is-active" : "product-nav-link"} aria-current={active ? "page" : undefined}><span className="product-nav-icon" aria-hidden="true">{item.icon}</span><span className="product-nav-text">{item.label}</span><i aria-hidden="true" /></Link>; })}</div></div>)}</div>
        <div className="product-nav-footer">
          {organization ? <section className="workspace-context-card" aria-label="Active organization context" title={desktopCollapsed ? `${organization.activeOrganizationName} · ${organization.userName} · ${organization.activeRole}` : undefined}><div className="workspace-context-heading"><span className="workspace-context-avatar" aria-hidden="true">{organization.activeOrganizationName.slice(0, 1).toUpperCase()}</span><span className="workspace-context-copy"><strong>{organization.activeOrganizationName}</strong><small>{organization.userName} · {organization.activeRole}</small></span></div><div className="workspace-context-meta"><span>{organization.productCode ? productLabel[organization.productCode] ?? organization.productCode : "Workspace"}</span><span className={`workspace-status workspace-status-${organization.entitlementStatus ?? "unavailable"}`}><i aria-hidden="true" />{organization.entitlementStatus ?? "Not provisioned"}</span></div>{organization.organizations.length > 1 ? <form action={switchOrganization} className="workspace-switcher"><input type="hidden" name="next" value="/home" /><label><span className="sr-only">Active company</span><select name="organizationId" key={organization.activeOrganizationId} defaultValue={organization.activeOrganizationId} aria-label="Active company">{organization.organizations.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.role}</option>)}</select></label><Button type="submit">Switch</Button></form> : null}</section> : null}
          <Link className="product-onboarding-link" href={access.active ? "/onboarding" : "/activation"} title={desktopCollapsed ? (access.active ? "Workspace guide" : "Activation required") : undefined}><span aria-hidden="true">?</span><span className="product-onboarding-copy"><strong>{access.active ? "Workspace guide" : "Activation required"}</strong><small>{access.active ? "Review the operating flow" : "Commercial tools remain locked"}</small></span></Link>
          <div className="workspace-system-state"><i aria-hidden="true" /><span>Tenant isolated</span><strong>{access.platformAdmin ? "Platform admin" : access.active ? "Entitlement active" : "Fail-closed"}</strong></div>
          <form action={logout}><Button className="product-signout" type="submit" title={desktopCollapsed ? "Sign out" : undefined}><span className="product-signout-label">Sign out</span><span aria-hidden="true">↗</span></Button></form>
        </div>
      </div>
    </nav>
    <div className="app-mobile-bottom" aria-label="Mobile workspace navigation">{groups[0].items.filter(item => item.href !== "/reports").map(item => <Link key={item.href} href={item.href} aria-current={isRouteActive(pathname, item.href) ? "page" : undefined}><span aria-hidden="true">{item.icon}</span><small>{item.label === "My AI Company" ? "Company" : item.label}</small></Link>)}<Link href="/more" aria-current={["/more", "/settings", "/reports"].includes(pathname) ? "page" : undefined}><span aria-hidden="true">•••</span><small>More</small></Link></div>
    <header className="app-mobile-header"><Link className="product-brand" href="/home" aria-label="RYTHM Home"><RythmBrandLogo variant="primary" /></Link><Button type="button" aria-expanded={mobileOpen} aria-controls="workspace-navigation" onClick={() => setMobileOpen(true)}><span>Menu</span><i aria-hidden="true" /><i aria-hidden="true" /></Button></header>
  </div>;
}
