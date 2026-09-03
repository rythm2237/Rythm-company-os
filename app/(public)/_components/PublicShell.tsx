"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import RythmBrandLogo from "@/components/brand/RythmBrandLogo";
import GuidedTour from "@/components/public-education/GuidedTour";
import PublicEducationProvider, { usePublicEducation } from "@/components/public-education/PublicEducationProvider";
import { trackPublicExperienceEvent } from "@/lib/analytics/public-events";
import { PUBLIC_NAVIGATION } from "@/lib/public-experience/content";

const NAVIGATION_GROUPS = [
  { label: "Explore", items: PUBLIC_NAVIGATION.filter((item) => ["/product", "/demo", "/solutions", "/templates"].includes(item.href)) },
  { label: "Choose", items: PUBLIC_NAVIGATION.filter((item) => ["/pricing", "/enterprise", "/live-ai-meeting"].includes(item.href)) },
] as const;

const FOOTER_GROUPS = [
  {
    label: "Explore",
    links: [
      ["Product", "/product"],
      ["Demo", "/demo"],
      ["Pricing", "/pricing"],
      ["Enterprise", "/enterprise"],
      ["Templates", "/templates"],
    ],
  },
  {
    label: "Learn",
    links: [
      ["AI Workforce", "/ai-workforce"],
      ["AI Agents", "/ai-agents-for-business"],
      ["How It Works", "/how-it-works"],
      ["Product Architecture", "/product-architecture"],
      ["Use Cases", "/use-cases"],
      ["Startups", "/use-cases/startups"],
      ["Advertising Agencies", "/use-cases/agencies"],
      ["Software Companies", "/use-cases/software-companies"],
      ["Documentation", "/docs"],
      ["Comparisons", "/compare"],
      ["FAQ", "/faq"],
      ["Glossary", "/glossary"],
    ],
  },
  {
    label: "Trust",
    links: [
      ["Trust Center", "/trust"],
      ["Security", "/security"],
      ["AI Transparency", "/ai-transparency"],
      ["Subprocessors", "/subprocessors"],
    ],
  },
  {
    label: "Legal",
    links: [
      ["Legal Notice", "/legal"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["Consumer Terms", "/consumer-terms"],
      ["Consumer Rights", "/consumer-rights"],
      ["Withdrawal", "/withdrawal"],
      ["Cookies & Storage", "/cookies"],
      ["DPA", "/dpa"],
      ["Data Requests", "/data-requests"],
    ],
  },
  {
    label: "Help",
    links: [
      ["About", "/about"],
      ["Support", "/support"],
      ["Contact", "/contact"],
      ["Customer sign in", "/login"],
    ],
  },
] as const;

const NAVIGATION_ICONS: Record<string, string> = {
  "/product": "⌁", "/demo": "✦", "/solutions": "⌘", "/templates": "◇", "/pricing": "€", "/enterprise": "▦", "/live-ai-meeting": "◉",
};

const GUIDE_ENTRY_DELAY_MS = 3000;

function isRouteActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

type PublicShellProps = Readonly<{ children: React.ReactNode }>;

function PublicShellFrame({ children }: PublicShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const { copy, locale, tourState, experienceMode, openTour, setExperienceMode } = usePublicEducation();
  const demoRoute = pathname === "/demo";
  const immersive = demoRoute && experienceMode;

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => { if (experienceMode && !demoRoute) setExperienceMode(false); }, [demoRoute, experienceMode, setExperienceMode]);
  useEffect(() => { if (immersive) setMobileOpen(false); }, [immersive]);
  useEffect(() => {
    const timer = window.setTimeout(() => setShowGuide(true), GUIDE_ENTRY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  function handleOpenTour() {
    setShowGuide(true);
    openTour();
  }

  return (
    <div className={`marketing-shell${mobileOpen ? " is-navigation-open" : ""}${showGuide && tourState !== "closed" ? " is-guide-open" : ""}${immersive ? " is-experience-mode" : ""}`}>
      <button className="marketing-mobile-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
      <aside className="marketing-sidebar" id="public-navigation">
        <div className="marketing-sidebar-topline">
          <Link className="marketing-brand" href="/" aria-label="RYTHM home"><RythmBrandLogo priority variant="inverse" /></Link>
          <button className="marketing-sidebar-close" type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation">×</button>
        </div>
        <nav className="marketing-sidebar-navigation" aria-label="Public navigation">
          {NAVIGATION_GROUPS.map((group) => (
            <div className="marketing-nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const active = isRouteActive(pathname, item.href);
                return <Link className={active ? "is-active" : undefined} href={item.href} key={item.href} aria-current={active ? "page" : undefined}><span className="marketing-nav-icon" aria-hidden="true">{NAVIGATION_ICONS[item.href]}</span><span>{item.label}</span><i aria-hidden="true" /></Link>;
              })}
            </div>
          ))}
        </nav>
        <div className="marketing-sidebar-footer">
          <button className="marketing-guide-launcher" type="button" onClick={handleOpenTour} dir={copy.direction} lang={locale}><span aria-hidden="true">?</span><span><strong>{copy.ui.guideLauncherTitle}</strong><small>{copy.ui.guideLauncherDetail}</small></span></button>
          <div className="marketing-system-state"><i aria-hidden="true" /><span>Public experience</span><strong>Safe to explore</strong></div>
          <div className="marketing-sidebar-actions">
            <Link href="/login" onClick={() => trackPublicExperienceEvent({ name: "demo_sign_in_clicked", properties: { source: "public_sidebar", locale } })}>Sign in</Link>
            <Link className="marketing-button" href="/signup" onClick={() => trackPublicExperienceEvent({ name: "demo_get_started_clicked", properties: { source: "public_sidebar", locale } })}>Get Started <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </aside>
      <div className="marketing-stage">
        <header className="marketing-mobile-header">
          <Link className="marketing-brand" href="/" aria-label="RYTHM home"><RythmBrandLogo variant="primary" /></Link>
          <div><Link href="/login" onClick={() => trackPublicExperienceEvent({ name: "demo_sign_in_clicked", properties: { source: "public_mobile_header", locale } })}>Sign in</Link><button type="button" aria-expanded={mobileOpen} aria-controls="public-navigation" onClick={() => setMobileOpen(true)}><span>Menu</span><i aria-hidden="true" /><i aria-hidden="true" /></button></div>
        </header>
        <div className="marketing-page-transition" key={pathname}>{children}</div>
        <footer className="marketing-footer marketing-footer-structured" aria-label="RYTHM public footer">
          <div className="marketing-footer-brand">
            <RythmBrandLogo variant="primary" />
            <p>Governed AI workforces under Human CEO authority.</p>
          </div>
          <nav className="marketing-footer-groups" aria-label="Footer navigation">
            {FOOTER_GROUPS.map((group) => (
              <section className="marketing-footer-group" key={group.label}>
                <h2>{group.label}</h2>
                <div>{group.links.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</div>
              </section>
            ))}
          </nav>
          <div className="marketing-footer-bottom">
            <span>© 2026 RYTHM Company OS</span>
            <span>Human authority · governed AI · privacy by design</span>
          </div>
        </footer>
      </div>
      {showGuide ? <GuidedTour /> : null}
    </div>
  );
}

export default function PublicShell({ children }: PublicShellProps) {
  return <PublicEducationProvider><PublicShellFrame>{children}</PublicShellFrame></PublicEducationProvider>;
}
