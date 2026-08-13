"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import LanguageSelector from "@/components/public-education/LanguageSelector";
import {
  getActiveTourStep,
  usePublicEducation,
} from "@/components/public-education/PublicEducationProvider";
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
  rect: DOMRect;
};

const GROUPS = ["Operate", "Build", "Govern", "Review"] as const;

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
  const activeSurface: DemoSurface =
    NOVA_COMMERCE_DEMO.surfaces.find((surface) => surface.id === surfaceId) ?? NOVA_COMMERCE_DEMO.surfaces[0];
  const selectedAgent = NOVA_COMMERCE_DEMO.agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const activeTour = getActiveTourStep(tourStep);
  const showConversion = meaningfulInteractions.size >= 4 && tourState === "closed";

  useEffect(() => {
    setConversionDismissed(window.sessionStorage.getItem("rythm-demo-conversion-dismissed-v1") === "true");
  }, []);

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

  useEffect(() => {
    if (!explanation) return;
    function closeOnViewportChange() {
      setExplanation(null);
    }
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
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

  const openExplanation = useCallback((element: HTMLElement) => {
    if (!explainMode || tourState !== "closed") return;
    const key = explainKeyFromElement(element);
    if (!key) return;
    setExplanation({ key, anchor: element, rect: element.getBoundingClientRect() });
    trackPublicExperienceEvent({
      name: "explanation_opened",
      properties: { concept: key, locale },
    });
  }, [explainMode, locale, tourState]);

  function closeExplanation({ restoreFocus = false } = {}) {
    const anchor = explanation?.anchor;
    setExplanation(null);
    if (restoreFocus) window.setTimeout(() => anchor?.focus(), 0);
  }

  function selectSurface(nextSurface: DemoSurfaceId) {
    setSurfaceId(nextSurface);
    setSelectedAgentId(null);
    registerInteraction(`surface:${nextSurface}`);
  }

  function selectAgent(agentId: string) {
    setSelectedAgentId(agentId);
    registerInteraction(`agent:${agentId}`);
  }

  function resetDemo() {
    setSurfaceId("command");
    setSelectedAgentId(null);
    setExplanation(null);
    setMeaningfulInteractions(new Set());
  }

  function handlePointerOver(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;
    const target = closestExplainTarget(event.target);
    if (target && target !== explanation?.anchor) openExplanation(target);
  }

  function handleFocus(event: FocusEvent<HTMLElement>) {
    const target = closestExplainTarget(event.target);
    if (target) openExplanation(target);
  }

  function handleClick(event: MouseEvent<HTMLElement>) {
    if (!explainMode || tourState !== "closed") return;
    const target = closestExplainTarget(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    openExplanation(target);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      if (explanation) closeExplanation({ restoreFocus: true });
      else if (explainMode) closeExplainMode();
      else if (experienceMode) setExperienceMode(false);
      return;
    }
    if (!explainMode || !["Enter", " "].includes(event.key)) return;
    const target = closestExplainTarget(event.target);
    if (!target) return;
    event.preventDefault();
    openExplanation(target);
  }

  function dismissConversion() {
    setConversionDismissed(true);
    setConversionExpanded(false);
    window.sessionStorage.setItem("rythm-demo-conversion-dismissed-v1", "true");
  }

  const explanationCopy = explanation ? copy.explanations[explanation.key] : null;
  const explanationPosition = explanation && typeof window !== "undefined" ? {
    top: Math.max(16, Math.min(explanation.rect.bottom + 12, window.innerHeight - 430)),
    left: Math.max(16, Math.min(explanation.rect.left, window.innerWidth - 396)),
  } : undefined;

  return (
    <section
      className={`demo-workspace${explainMode ? " is-explain-mode" : ""}${experienceMode ? " is-immersive" : ""}`}
      aria-label="Nova Commerce synthetic Demo Workspace"
      onPointerOver={handlePointerOver}
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

      <div className="demo-education-toolbar" role="toolbar" aria-label={copy.ui.learningControls} dir={copy.direction} lang={locale}>
        <div>
          <button
            className={experienceMode ? "is-active" : undefined}
            type="button"
            aria-pressed={experienceMode}
            onClick={() => setExperienceMode(!experienceMode)}
          >
            <span aria-hidden="true">⌗</span>
            {experienceMode ? copy.ui.exitExperienceMode : copy.ui.experienceMode}
          </button>
          <button
            className={explainMode ? "is-active" : undefined}
            type="button"
            aria-pressed={explainMode}
            disabled={tourState === "active" || tourState === "complete"}
            onClick={() => explainMode ? closeExplainMode() : startExplainMode()}
          >
            <span aria-hidden="true">?</span>
            {explainMode ? copy.ui.exitExplainMode : copy.ui.explainMode}
          </button>
          <button type="button" onClick={openTour}><span aria-hidden="true">✦</span>{copy.ui.restartTour}</button>
        </div>
        <div>
          {explainMode ? <span className="demo-explain-hint">{copy.ui.explainHint}</span> : null}
          <LanguageSelector compact />
        </div>
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
            <button className="demo-panel-close" type="button" onClick={() => setSelectedAgentId(null)} aria-label="Close Agent profile">×</button>
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
          className="demo-explanation-popover"
          role="dialog"
          aria-modal="false"
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
        <aside className={`demo-contextual-conversion${conversionDismissed || !conversionExpanded ? " is-minimized" : ""}`} dir={copy.direction} lang={locale}>
          {conversionDismissed || !conversionExpanded ? (
            <button type="button" onClick={() => { setConversionDismissed(false); setConversionExpanded(true); }}>{copy.ui.buildCompany} <span aria-hidden="true">✦</span></button>
          ) : (
            <>
              <button className="demo-conversion-dismiss" type="button" onClick={dismissConversion} aria-label={copy.ui.dismiss}>×</button>
              <p className="marketing-kicker">{copy.ui.conversionEyebrow}</p>
              <h3>{copy.ui.conversionTitle}</h3>
              <p>{copy.ui.conversionDescription}</p>
              <div>
                <Link href="/pricing" onClick={() => trackPublicExperienceEvent({ name: "demo_get_started_clicked", properties: { destination: "pricing", locale } })}>{copy.ui.explorePlans}</Link>
                <Link className="marketing-button" href="/signup" onClick={() => trackPublicExperienceEvent({ name: "demo_get_started_clicked", properties: { destination: "signup", locale } })}>{copy.ui.buildCompany}</Link>
              </div>
            </>
          )}
        </aside>
      ) : null}
    </section>
  );
}
