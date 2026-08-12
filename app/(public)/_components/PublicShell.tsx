"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PUBLIC_NAVIGATION } from "@/lib/public-experience/content";

const GUIDE_STORAGE_KEY = "rythm-public-guide-v2";

const NAVIGATION_GROUPS = [
  {
    label: "Explore",
    items: PUBLIC_NAVIGATION.filter((item) => ["/product", "/demo", "/solutions", "/templates"].includes(item.href)),
  },
  {
    label: "Choose",
    items: PUBLIC_NAVIGATION.filter((item) => ["/pricing", "/enterprise", "/live-ai-meeting"].includes(item.href)),
  },
] as const;

const NAVIGATION_ICONS: Record<string, string> = {
  "/product": "⌁",
  "/demo": "✦",
  "/solutions": "⌘",
  "/templates": "◇",
  "/pricing": "€",
  "/enterprise": "▦",
  "/live-ai-meeting": "◉",
};

const GUIDE_STEPS = [
  {
    target: "nav-overview",
    eyebrow: "Your map",
    title: "Everything begins with exploration.",
    description: "Use this fixed navigation to understand RYTHM, experience the product, and compare paths without creating an account.",
  },
  {
    target: "/demo",
    eyebrow: "Experience",
    title: "Step inside a working AI company.",
    description: "Nova Commerce is a synthetic, read-only workspace. Explore Agents, meetings, projects, approvals, and traceability safely.",
  },
  {
    target: "/solutions",
    eyebrow: "Understand",
    title: "Find the operating model that fits.",
    description: "See the difference between a ready-made company, a custom company, and an enterprise workforce before choosing one.",
  },
  {
    target: "/live-ai-meeting",
    eyebrow: "Try your problem",
    title: "Preview a governed AI Boardroom.",
    description: "The Live AI Meeting path is designed for one real objective, bounded context, clear roles, and structured output.",
  },
  {
    target: "get-started",
    eyebrow: "Build",
    title: "Create an account only when you are ready.",
    description: "Signup starts the guided solution flow. Your company name is requested later, when actual provisioning begins.",
  },
] as const;

function isRouteActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

type PublicShellProps = Readonly<{
  children: React.ReactNode;
}>;

export default function PublicShell({ children }: PublicShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStarted, setGuideStarted] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const guideDialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!window.localStorage.getItem(GUIDE_STORAGE_KEY)) setGuideOpen(true);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!guideOpen) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => guideDialogRef.current?.focus(), 50);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissGuide("dismissed");
      if (event.key !== "Tab" || !guideDialogRef.current) return;

      const focusable = Array.from(
        guideDialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === guideDialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === guideDialogRef.current) {
        event.preventDefault();
        first.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [guideOpen]);

  useEffect(() => {
    document.querySelectorAll(".is-guide-target").forEach((element) => element.classList.remove("is-guide-target"));
    if (!guideOpen || !guideStarted) return;

    const target = document.querySelector<HTMLElement>(`[data-guide-id="${GUIDE_STEPS[guideStep].target}"]`);
    target?.classList.add("is-guide-target");
    target?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    return () => target?.classList.remove("is-guide-target");
  }, [guideOpen, guideStarted, guideStep]);

  function dismissGuide(result: "dismissed" | "completed") {
    window.localStorage.setItem(GUIDE_STORAGE_KEY, result);
    setGuideOpen(false);
    setGuideStarted(false);
    setGuideStep(0);
    setMobileOpen(false);
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }

  function openGuide() {
    setGuideStep(0);
    setGuideStarted(false);
    setGuideOpen(true);
  }

  function startGuide() {
    setGuideStep(0);
    setGuideStarted(true);
    setMobileOpen(true);
  }

  const guideContent = GUIDE_STEPS[guideStep];

  return (
    <div className={`marketing-shell${mobileOpen ? " is-navigation-open" : ""}${guideOpen && guideStarted ? " is-guide-open" : ""}`}>
      <button
        className="marketing-mobile-backdrop"
        type="button"
        aria-label="Close navigation"
        onClick={() => setMobileOpen(false)}
      />

      <aside className="marketing-sidebar" data-guide-id="nav-overview" id="public-navigation">
        <div className="marketing-sidebar-topline">
          <Link className="marketing-brand" href="/" aria-label="RYTHM home">
            <span aria-hidden="true">R</span>
            <span className="marketing-brand-wordmark"><strong>RYTHM</strong><small>Company OS</small></span>
          </Link>
          <button className="marketing-sidebar-close" type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation">×</button>
        </div>

        <nav className="marketing-sidebar-navigation" aria-label="Public navigation">
          {NAVIGATION_GROUPS.map((group) => (
            <div className="marketing-nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const active = isRouteActive(pathname, item.href);
                return (
                  <Link
                    className={active ? "is-active" : undefined}
                    data-guide-id={item.href}
                    href={item.href}
                    key={item.href}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="marketing-nav-icon" aria-hidden="true">{NAVIGATION_ICONS[item.href]}</span>
                    <span>{item.label}</span>
                    <i aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="marketing-sidebar-footer">
          <button className="marketing-guide-launcher" type="button" onClick={openGuide}>
            <span aria-hidden="true">?</span>
            <span><strong>New to RYTHM?</strong><small>Start the guided tour</small></span>
          </button>
          <div className="marketing-system-state"><i aria-hidden="true" /><span>Public experience</span><strong>Safe to explore</strong></div>
          <div className="marketing-sidebar-actions">
            <Link href="/login">Sign in</Link>
            <Link className="marketing-button" data-guide-id="get-started" href="/signup">Get Started <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </aside>

      <div className="marketing-stage">
        <header className="marketing-mobile-header">
          <Link className="marketing-brand" href="/" aria-label="RYTHM home"><span aria-hidden="true">R</span><strong>RYTHM</strong></Link>
          <div>
            <Link href="/login">Sign in</Link>
            <button type="button" aria-expanded={mobileOpen} aria-controls="public-navigation" onClick={() => setMobileOpen(true)}>
              <span>Menu</span><i aria-hidden="true" /><i aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="marketing-page-transition" key={pathname}>{children}</div>
        <footer className="marketing-footer">
          <div><strong>RYTHM</strong><p>Governed AI companies under Human CEO authority.</p></div>
          <div><Link href="/product">Product</Link><Link href="/demo">Demo</Link><Link href="/templates">Templates</Link><Link href="/pricing">Pricing</Link><Link href="/enterprise">Enterprise Beta</Link><Link href="/login">Customer sign in</Link></div>
        </footer>
      </div>

      {guideOpen ? (
        <>
          <button className="marketing-guide-scrim" type="button" aria-label="Close guided tour" onClick={() => dismissGuide("dismissed")} />
          <div
            className="marketing-guide-dialog"
            ref={guideDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="marketing-guide-title"
            tabIndex={-1}
          >
            {!guideStarted ? (
              <>
                <div className="marketing-guide-orbit" aria-hidden="true"><span>R</span><i /><i /></div>
                <p className="marketing-kicker">OPTIONAL · ABOUT 60 SECONDS</p>
                <h2 id="marketing-guide-title">Want a quick tour of RYTHM?</h2>
                <p>We will show you where to experience the product, understand the options, and begin when you are ready.</p>
                <div className="marketing-guide-actions">
                  <button className="marketing-secondary-button" type="button" onClick={() => dismissGuide("dismissed")}>Not now</button>
                  <button className="marketing-button" type="button" onClick={startGuide}>Start tour <span aria-hidden="true">→</span></button>
                </div>
              </>
            ) : (
              <>
                <div className="marketing-guide-progress" aria-label={`Step ${guideStep + 1} of ${GUIDE_STEPS.length}`}>
                  <span>{String(guideStep + 1).padStart(2, "0")}</span>
                  <div>{GUIDE_STEPS.map((step, index) => <i className={index <= guideStep ? "is-complete" : undefined} key={step.target} />)}</div>
                  <small>{String(GUIDE_STEPS.length).padStart(2, "0")}</small>
                </div>
                <p className="marketing-kicker">{guideContent.eyebrow}</p>
                <h2 id="marketing-guide-title">{guideContent.title}</h2>
                <p>{guideContent.description}</p>
                <div className="marketing-guide-actions">
                  <button className="marketing-guide-skip" type="button" onClick={() => dismissGuide("dismissed")}>Skip tour</button>
                  <div>
                    {guideStep > 0 ? <button className="marketing-secondary-button" type="button" onClick={() => setGuideStep((step) => step - 1)}>Back</button> : null}
                    {guideStep < GUIDE_STEPS.length - 1 ? (
                      <button className="marketing-button" type="button" onClick={() => setGuideStep((step) => step + 1)}>Next <span aria-hidden="true">→</span></button>
                    ) : (
                      <button className="marketing-button" type="button" onClick={() => dismissGuide("completed")}>Finish <span aria-hidden="true">✓</span></button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
