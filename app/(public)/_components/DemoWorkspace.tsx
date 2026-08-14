"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  getActiveTourStep,
  usePublicEducation,
} from "@/components/public-education/PublicEducationProvider";
import LanguageSelector from "@/components/public-education/LanguageSelector";
import { trackPublicExperienceEvent } from "@/lib/analytics/public-events";
import {
  NOVA_COMMERCE_DEMO,
  type DemoAgent,
  type DemoSurface,
  type DemoSurfaceId,
} from "@/lib/demo/nova-commerce";
import {
  EXPLAIN_KEYS,
  type ExplainKey,
} from "@/lib/public-education/types";

type Props = {
  initialSurface?: DemoSurfaceId;
};

type ExplanationState = {
  key: ExplainKey;
  anchor: HTMLElement;
  point: { x: number; y: number } | null;
};

type FloatingPosition = {
  top: number;
  left: number;
};

const GROUPS = ["Operate", "Build", "Govern", "Review"] as const;
const EXPERIENCE_DISCOVERY_STORAGE_KEY = "rythm-demo-experience-discovered-v1";

const SURFACE_EXPLANATIONS: Record<DemoSurfaceId, ExplainKey> = {
  command: "operatingContext",
  projects: "projects",
  actions: "actions",
  agents: "aiAgents",
  templates: "templates",
  builder: "companyBuilder",
  ideas: "ideas",
  boardroom: "boardroom",
  traceability: "traceability",
  attention: "attention",
  "executive-review": "executiveReview",
  economics: "economics",
  "operations-health": "operationsHealth",
};

function statusClass(status: DemoAgent["status"]) {
  return `demo-status status-${status.toLowerCase().replaceAll(" ", "-")}`;
}

function explainKeyFromElement(element: HTMLElement) {
  const value = element.dataset.explainKey;
  return EXPLAIN_KEYS.includes(value as ExplainKey) ? value as ExplainKey : null;
}

function closestExplainTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest("[data-explain-key]") as HTMLElement | null;
}

function isInteractiveExplainTarget(target: HTMLElement) {
  return target.matches("button, a[href], input, select, textarea, [role='button'], [role='link']");
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function overlapArea(
  first: { top: number; right: number; bottom: number; left: number },
  second: { top: number; right: number; bottom: number; left: number },
) {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  return width * height;
}

function getExplanationPosition(
  anchor: DOMRect,
  point: { x: number; y: number } | null,
  popoverWidth: number,
  popoverHeight: number,
): FloatingPosition {
  const margin = 12;
  const gap = 16;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const origin = point ?? { x: anchor.left + (anchor.width / 2), y: anchor.top + (anchor.height / 2) };
  const candidates = [
    { left: origin.x + gap, top: origin.y + gap },
    { left: origin.x - popoverWidth - gap, top: origin.y + gap },
    { left: origin.x + gap, top: origin.y - popoverHeight - gap },
    { left: origin.x - popoverWidth - gap, top: origin.y - popoverHeight - gap },
    { left: anchor.right + gap, top: origin.y - (popoverHeight / 2) },
    { left: anchor.left - popoverWidth - gap, top: origin.y - (popoverHeight / 2) },
    { left: origin.x - (popoverWidth / 2), top: anchor.bottom + gap },
    { left: origin.x - (popoverWidth / 2), top: anchor.top - popoverHeight - gap },
  ];
  const paddedAnchor = {
    top: anchor.top - 8,
    right: anchor.right + 8,
    bottom: anchor.bottom + 8,
    left: anchor.left - 8,
  };

  return candidates.map((candidate, index) => {
    const left = clamp(candidate.left, margin, viewportWidth - popoverWidth - margin);
    const top = clamp(candidate.top, margin, viewportHeight - popoverHeight - margin);
    const rectangle = {
      top,
      right: left + popoverWidth,
      bottom: top + popoverHeight,
      left,
    };
    const displacement = Math.abs(left - candidate.left) + Math.abs(top - candidate.top);
    return {
      left,
      top,
      score: (overlapArea(rectangle, paddedAnchor) * 100) + displacement + index,
    };
  }).sort((first, second) => first.score - second.score)[0];
}

export default function DemoWorkspace({ initialSurface = "command" }: Props) {
  const {
    copy,
    locale,
    tourState,
    tourStep,
    explainMode,
    experienceMode,
    openTour,
    startExplainMode,
    closeExplainMode,
    setExperienceMode,
  } = usePublicEducation();
  const [surfaceId, setSurfaceId] = useState<DemoSurfaceId>(initialSurface);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<ExplanationState | null>(null);
  const [meaningfulInteractions, setMeaningfulInteractions] = useState<Set<string>>(() => new Set());
  const [conversionDismissed, setConversionDismissed] = useState(false);
  const [conversionExpanded, setConversionExpanded] = useState(true);
  const [experienceHintVisible, setExperienceHintVisible] = useState(false);
  const suppressFocusExplanationRef = useRef(false);
  const lastPointerTypeRef = useRef("mouse");
  const explanationRef = useRef<HTMLElement>(null);
  const [explanationPosition, setExplanationPosition] = useState<FloatingPosition | undefined>();
  const activeSurface: DemoSurface =
    NOVA_COMMERCE_DEMO.surfaces.find((surface) => surface.id === surfaceId) ?? NOVA_COMMERCE_DEMO.surfaces[0];
  const selectedAgent = NOVA_COMMERCE_DEMO.agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const activeTour = getActiveTourStep(tourStep);
  const showConversion = meaningfulInteractions.size >= 4
    && tourState === "closed"
    && !explainMode
    && !experienceMode;

  useEffect(() => {
    setConversionDismissed(window.sessionStorage.getItem("rythm-demo-conversion-dismissed-v1") === "true");
  }, []);

  useEffect(() => {
    if (tourState !== "closed" || experienceMode) {
      setExperienceHintVisible(false);
      return;
    }

    const storedDiscovery = window.localStorage.getItem(EXPERIENCE_DISCOVERY_STORAGE_KEY);
    if (storedDiscovery === "seen") return;
    if (storedDiscovery !== null) window.localStorage.removeItem(EXPERIENCE_DISCOVERY_STORAGE_KEY);

    let dismissTimer = 0;
    const revealTimer = window.setTimeout(() => {
      setExperienceHintVisible(true);
      window.localStorage.setItem(EXPERIENCE_DISCOVERY_STORAGE_KEY, "seen");
      trackPublicExperienceEvent({
        name: "experience_mode_discovered",
        properties: { locale },
      });
      dismissTimer = window.setTimeout(() => setExperienceHintVisible(false), 7000);
    }, 700);

    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [experienceMode, locale, tourState]);

  useEffect(() => {
    if (tourState !== "active") return;
    setSurfaceId(activeTour.surface as DemoSurfaceId);
    setSelectedAgentId(null);
    setExplanation(null);
  }, [activeTour.surface, tourState]);

  useEffect(() => {
    if (explainMode) return;
    setExplanation(null);
  }, [explainMode]);

  useLayoutEffect(() => {
    if (!explanation || !explanationRef.current) return;

    const currentExplanation = explanation;
    let frame = 0;
    function updatePosition() {
      if (!explanationRef.current) return;
      if (!currentExplanation.anchor.isConnected) {
        setExplanation(null);
        return;
      }
      const anchorRect = currentExplanation.anchor.getBoundingClientRect();
      const popoverRect = explanationRef.current.getBoundingClientRect();
      setExplanationPosition(getExplanationPosition(
        anchorRect,
        currentExplanation.point,
        popoverRect.width,
        popoverRect.height,
      ));
    }
    function schedulePositionUpdate() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updatePosition);
    }

    updatePosition();
    window.addEventListener("resize", schedulePositionUpdate);
    window.addEventListener("scroll", schedulePositionUpdate, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedulePositionUpdate);
      window.removeEventListener("scroll", schedulePositionUpdate, true);
    };
  }, [explanation]);

  const registerInteraction = useCallback((id: string) => {
    setMeaningfulInteractions((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, []);

  const openExplanation = useCallback((element: HTMLElement, point: { x: number; y: number } | null = null) => {
    if (suppressFocusExplanationRef.current || !explainMode || tourState !== "closed") return;
    const key = explainKeyFromElement(element);
    if (!key) return;
    const rect = element.getBoundingClientRect();
    setExplanation({ key, anchor: element, point });
    setExplanationPosition(getExplanationPosition(rect, point, Math.min(380, window.innerWidth - 24), Math.min(400, window.innerHeight - 24)));
    trackPublicExperienceEvent({
      name: "explanation_viewed",
      properties: { concept: key, locale },
    });
  }, [explainMode, locale, tourState]);

  function closeExplanation({ restoreFocus = false } = {}) {
    const anchor = explanation?.anchor;
    setExplanation(null);
    if (restoreFocus) {
      suppressFocusExplanationRef.current = true;
      window.setTimeout(() => {
        anchor?.focus();
        window.requestAnimationFrame(() => { suppressFocusExplanationRef.current = false; });
      }, 0);
    }
  }

  function selectSurface(nextSurface: DemoSurfaceId) {
    setExplanation(null);
    setSurfaceId(nextSurface);
    setSelectedAgentId(null);
    registerInteraction(`surface:${nextSurface}`);
  }

  function selectAgent(agentId: string) {
    setExplanation(null);
    setSelectedAgentId(agentId);
    registerInteraction(`agent:${agentId}`);
  }

  function resetDemo() {
    setSurfaceId("command");
    setSelectedAgentId(null);
    setExplanation(null);
    setMeaningfulInteractions(new Set());
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    lastPointerTypeRef.current = event.pointerType;
  }

  function handlePointerOver(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;
    const target = closestExplainTarget(event.target);
    if (target && target !== explanation?.anchor) openExplanation(target, { x: event.clientX, y: event.clientY });
  }

  function handleFocus(event: FocusEvent<HTMLElement>) {
    if (lastPointerTypeRef.current === "touch") return;
    const target = closestExplainTarget(event.target);
    if (target) openExplanation(target);
  }

  function handleClick(event: MouseEvent<HTMLElement>) {
    if (!explainMode || tourState !== "closed") return;
    const target = closestExplainTarget(event.target);
    if (!target) {
      if (
        explanation
        && event.target instanceof Node
        && !explanationRef.current?.contains(event.target)
      ) closeExplanation();
      return;
    }

    if (explanation?.anchor === target) {
      if (isInteractiveExplainTarget(target)) {
        setExplanation(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeExplanation({ restoreFocus: lastPointerTypeRef.current === "keyboard" });
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openExplanation(target, { x: event.clientX, y: event.clientY });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    lastPointerTypeRef.current = "keyboard";
    if (event.key === "Escape") {
      if (explanation) closeExplanation({ restoreFocus: true });
      else if (explainMode) closeExplainMode();
      else if (experienceMode) setExperienceMode(false);
      return;
    }
    if (!explainMode || !["Enter", " "].includes(event.key)) return;
    const target = closestExplainTarget(event.target);
    if (!target) return;
    lastPointerTypeRef.current = "keyboard";
    if (explanation?.anchor === target) {
      if (isInteractiveExplainTarget(target)) return;
      event.preventDefault();
      closeExplanation({ restoreFocus: true });
      return;
    }
    event.preventDefault();
    openExplanation(target);
  }

  function dismissConversion() {
    setConversionDismissed(true);
    setConversionExpanded(false);
    window.sessionStorage.setItem("rythm-demo-conversion-dismissed-v1", "true");
  }

  const explanationCopy = explanation ? copy.explanations[explanation.key] : null;
  return (
    <section
      className={`demo-workspace${explainMode ? " is-explain-mode" : ""}${experienceMode ? " is-immersive" : ""}`}
      aria-label="Nova Commerce synthetic Demo Workspace"
      onPointerOver={handlePointerOver}
      onPointerDownCapture={handlePointerDown}
      onFocusCapture={handleFocus}
      onClickCapture={handleClick}
      onKeyDownCapture={handleKeyDown}
    >
      <header className="demo-topbar" data-explain-key="syntheticDemo" tabIndex={explainMode ? 0 : undefined}>
        <div>
          <p className="marketing-kicker">DEMO WORKSPACE · SYNTHETIC DATA</p>
          <div className="demo-org-title">
            <span className="demo-org-mark" aria-hidden="true">N</span>
            <div><strong>{NOVA_COMMERCE_DEMO.organization.name}</strong><small>{NOVA_COMMERCE_DEMO.organization.descriptor}</small></div>
          </div>
        </div>
        <div className="demo-boundary">
          <span data-explain-key="readOnlyDemo" tabIndex={explainMode ? 0 : undefined}><i aria-hidden="true" /> Read only</span>
          <button type="button" onClick={resetDemo}>{copy.ui.resetDemo}</button>
        </div>
      </header>

      <div
        className="demo-education-toolbar"
        role="toolbar"
        aria-label={copy.ui.learningControls}
        dir={copy.direction}
        lang={locale}
      >
        <div>
          <span className="demo-experience-control">
            <button
              className={experienceMode ? "is-active" : undefined}
              type="button"
              aria-pressed={experienceMode}
              onClick={() => {
                setExperienceHintVisible(false);
                setExperienceMode(!experienceMode);
              }}
            >
              <span aria-hidden="true">⌗</span>
              {experienceMode ? copy.ui.exitExperienceMode : copy.ui.experienceMode}
            </button>
          </span>
          <button
            className={explainMode ? "is-active" : undefined}
            type="button"
            aria-pressed={explainMode}
            aria-label={explainMode ? copy.ui.exitExplainMode : copy.ui.explainMode}
            disabled={tourState === "active"}
            onClick={() => explainMode ? closeExplainMode() : startExplainMode()}
          >
            <span aria-hidden="true">?</span>
            {explainMode ? copy.ui.explainModeActive : copy.ui.explainMode}
          </button>
          <button type="button" onClick={openTour}><span aria-hidden="true">✦</span>{copy.ui.restartTour}</button>
        </div>
        <div>
          {explainMode ? <span className="demo-explain-hint">{copy.ui.explainHint}</span> : null}
          <LanguageSelector compact />
        </div>
        {experienceHintVisible ? (
          <span className="demo-experience-discovery" role="status">
            {copy.ui.experienceDiscoveryHint}
            <button type="button" onClick={() => setExperienceHintVisible(false)} aria-label={copy.ui.dismiss}>×</button>
          </span>
        ) : null}
      </div>

      <div className="demo-frame">
        <nav className="demo-navigation" aria-label="Demo workspace navigation">
          {GROUPS.map((group) => (
            <div className="demo-navigation-group" key={group}>
              <span>{group}</span>
              {NOVA_COMMERCE_DEMO.surfaces.filter((surface) => surface.group === group).map((surface) => (
                <button
                  type="button"
                  key={surface.id}
                  className={surface.id === activeSurface.id ? "is-active" : undefined}
                  aria-pressed={surface.id === activeSurface.id}
                  data-explain-key={SURFACE_EXPLANATIONS[surface.id]}
                  onClick={() => selectSurface(surface.id)}
                >
                  {surface.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="demo-main">
          <div className="demo-main-heading">
            <div
              data-explain-key={SURFACE_EXPLANATIONS[activeSurface.id]}
              data-tour-id={`demo-${activeSurface.id}`}
              tabIndex={explainMode ? 0 : undefined}
            >
              <p className="marketing-kicker">{activeSurface.eyebrow}</p>
              <h2>{activeSurface.title}</h2>
              <p>{activeSurface.description}</p>
            </div>
            <span
              className="demo-context-pill"
              data-explain-key="humanCeo"
              data-tour-id="demo-human-ceo"
              tabIndex={explainMode ? 0 : undefined}
            >Human CEO view</span>
          </div>

          <div className="demo-metric-grid">
            {activeSurface.id === "command" ? NOVA_COMMERCE_DEMO.metrics.map((metric) => {
              const explainKey: ExplainKey = metric.label === "AI Agents"
                ? "aiAgents"
                : metric.label === "Active Projects"
                  ? "projects"
                  : metric.label === "CEO Approvals"
                    ? "ceoApprovals"
                    : "operatingContext";
              return (
                <article data-explain-key={explainKey} tabIndex={explainMode ? 0 : undefined} key={metric.label}>
                  <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small>
                </article>
              );
            }) : activeSurface.cards.map((card) => (
              <article
                className={card.tone ? `is-${card.tone}` : undefined}
                data-explain-key={activeSurface.id === "actions" && card.label === "Awaiting approval" ? "approvalBoundary" : SURFACE_EXPLANATIONS[activeSurface.id]}
                tabIndex={explainMode ? 0 : undefined}
                key={card.label}
              >
                <span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small>
              </article>
            ))}
          </div>

          {activeSurface.id === "agents" ? (
            <div className="demo-agent-grid" aria-label="Demo AI workforce">
              {NOVA_COMMERCE_DEMO.agents.map((agent) => (
                <button type="button" key={agent.id} data-explain-key="aiAgents" onClick={() => selectAgent(agent.id)}>
                  <span className="demo-agent-avatar" aria-hidden="true">{agent.name.slice(0, 1)}</span>
                  <span className="demo-agent-identity"><strong>{agent.name}</strong><small>{agent.role}</small></span>
                  <span className={statusClass(agent.status)}>{agent.status}</span>
                  <span className="demo-agent-activity">{agent.activity}</span>
                </button>
              ))}
            </div>
          ) : (
            <section className="demo-timeline" aria-labelledby="demo-activity-heading" data-explain-key="operatingContext" tabIndex={explainMode ? 0 : undefined}>
              <div className="demo-section-title"><h3 id="demo-activity-heading">Operating context</h3><span>Live simulation</span></div>
              {activeSurface.timeline.map((item) => (
                <article key={`${activeSurface.id}-${item.title}`}>
                  <span className="demo-event-dot" aria-hidden="true" />
                  <div><strong>{item.title}</strong><p>{item.detail}</p><small>{item.meta}</small></div>
                </article>
              ))}
            </section>
          )}
        </div>

        {selectedAgent ? (
          <aside className="demo-agent-panel" aria-label={`${selectedAgent.name} Agent profile`}>
            <button
              className="demo-panel-close"
              type="button"
              onClick={() => {
                setExplanation(null);
                setSelectedAgentId(null);
              }}
              aria-label="Close Agent profile"
            >×</button>
            <p className="marketing-kicker">AI ORGANIZATIONAL MEMBER</p>
            <div className="demo-agent-profile-heading" data-explain-key="aiAgents" tabIndex={explainMode ? 0 : undefined}>
              <span className="demo-agent-avatar" aria-hidden="true">{selectedAgent.name.slice(0, 1)}</span>
              <div><h3>{selectedAgent.name}</h3><p>{selectedAgent.role}</p></div>
            </div>
            <dl>
              <div><dt>Department</dt><dd>{selectedAgent.department}</dd></div>
              <div><dt>Reports to</dt><dd>{selectedAgent.manager}</dd></div>
              <div data-explain-key="agentStatus" tabIndex={explainMode ? 0 : undefined}><dt>Status</dt><dd><span className={statusClass(selectedAgent.status)}>{selectedAgent.status}</span></dd></div>
              <div data-explain-key="agentAuthority" tabIndex={explainMode ? 0 : undefined}><dt>Authority</dt><dd>{selectedAgent.authority}</dd></div>
              <div data-explain-key="risk" tabIndex={explainMode ? 0 : undefined}><dt>Risk ceiling</dt><dd>{selectedAgent.risk}</dd></div>
            </dl>
            <section><span>Current activity</span><p>{selectedAgent.activity}</p></section>
            <section><span>Recent work</span><p>{selectedAgent.recentWork}</p></section>
            <p className="demo-panel-note" data-explain-key="externalActions" tabIndex={explainMode ? 0 : undefined}>Profile inspection only. This public Demo cannot enable, pause, edit, or invoke an Agent.</p>
          </aside>
        ) : null}
      </div>

      {explanation && explanationCopy ? (
        <aside
          ref={explanationRef}
          className="demo-explanation-popover"
          role="dialog"
          aria-modal="false"
          aria-live="polite"
          aria-labelledby="demo-explanation-title"
          dir={copy.direction}
          lang={locale}
          style={explanationPosition}
        >
          <button type="button" onClick={() => closeExplanation({ restoreFocus: true })} aria-label={copy.ui.close}>×</button>
          <p className="marketing-kicker">{copy.ui.whatIsThis}</p>
          <h3 id="demo-explanation-title">{explanationCopy.title}</h3>
          <p>{explanationCopy.what}</p>
          <dl>
            <div><dt>{copy.ui.whyItMatters}</dt><dd>{explanationCopy.why}</dd></div>
            <div><dt>{copy.ui.inRealCompany}</dt><dd>{explanationCopy.real}</dd></div>
          </dl>
        </aside>
      ) : null}

      {showConversion ? (
        <aside className={`demo-contextual-conversion${conversionDismissed || !conversionExpanded ? " is-minimized" : ""}`}>
          {conversionDismissed || !conversionExpanded ? (
            <button type="button" onClick={() => { setConversionDismissed(false); setConversionExpanded(true); }}>Build with RYTHM <span aria-hidden="true">✦</span></button>
          ) : (
            <>
              <button className="demo-conversion-dismiss" type="button" onClick={dismissConversion} aria-label="Dismiss">×</button>
              <p className="marketing-kicker">YOU HAVE SEEN THE OPERATING MODEL</p>
              <h3>Ready to build with RYTHM?</h3>
              <p>Keep exploring, compare company models, or start when you want to make the experience persistent.</p>
              <div>
                <Link href="/pricing" onClick={() => trackPublicExperienceEvent({ name: "demo_get_started_clicked", properties: { destination: "pricing", locale } })}>Explore plans</Link>
                <Link className="marketing-button" href="/signup" onClick={() => trackPublicExperienceEvent({ name: "demo_get_started_clicked", properties: { destination: "signup", locale } })}>Build your company</Link>
              </div>
            </>
          )}
        </aside>
      ) : null}
    </section>
  );
}
