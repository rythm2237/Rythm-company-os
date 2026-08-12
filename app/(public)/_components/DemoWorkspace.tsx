"use client";

import { useState } from "react";
import {
  NOVA_COMMERCE_DEMO,
  type DemoAgent,
  type DemoSurface,
  type DemoSurfaceId,
} from "@/lib/demo/nova-commerce";

type Props = {
  initialSurface?: DemoSurfaceId;
};

const GROUPS = ["Operate", "Build", "Govern", "Review"] as const;

function statusClass(status: DemoAgent["status"]) {
  return `demo-status status-${status.toLowerCase().replaceAll(" ", "-")}`;
}

export default function DemoWorkspace({ initialSurface = "command" }: Props) {
  const [surfaceId, setSurfaceId] = useState<DemoSurfaceId>(initialSurface);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const activeSurface: DemoSurface =
    NOVA_COMMERCE_DEMO.surfaces.find((surface) => surface.id === surfaceId) ?? NOVA_COMMERCE_DEMO.surfaces[0];
  const selectedAgent = NOVA_COMMERCE_DEMO.agents.find((agent) => agent.id === selectedAgentId) ?? null;

  function selectSurface(nextSurface: DemoSurfaceId) {
    setSurfaceId(nextSurface);
    setSelectedAgentId(null);
  }

  function resetDemo() {
    setSurfaceId("command");
    setSelectedAgentId(null);
  }

  return (
    <section className="demo-workspace" aria-label="Nova Commerce synthetic Demo Workspace">
      <header className="demo-topbar">
        <div>
          <p className="marketing-kicker">DEMO WORKSPACE · SYNTHETIC DATA</p>
          <div className="demo-org-title">
            <span className="demo-org-mark" aria-hidden="true">N</span>
            <div><strong>{NOVA_COMMERCE_DEMO.organization.name}</strong><small>{NOVA_COMMERCE_DEMO.organization.descriptor}</small></div>
          </div>
        </div>
        <div className="demo-boundary">
          <span><i aria-hidden="true" /> Read only</span>
          <button type="button" onClick={resetDemo}>Reset Demo</button>
        </div>
      </header>

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
            <div>
              <p className="marketing-kicker">{activeSurface.eyebrow}</p>
              <h2>{activeSurface.title}</h2>
              <p>{activeSurface.description}</p>
            </div>
            <span className="demo-context-pill">Human CEO view</span>
          </div>

          <div className="demo-metric-grid">
            {activeSurface.id === "command" ? NOVA_COMMERCE_DEMO.metrics.map((metric) => (
              <article key={metric.label}>
                <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small>
              </article>
            )) : activeSurface.cards.map((card) => (
              <article className={card.tone ? `is-${card.tone}` : undefined} key={card.label}>
                <span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small>
              </article>
            ))}
          </div>

          {activeSurface.id === "agents" ? (
            <div className="demo-agent-grid" aria-label="Demo AI workforce">
              {NOVA_COMMERCE_DEMO.agents.map((agent) => (
                <button type="button" key={agent.id} onClick={() => setSelectedAgentId(agent.id)}>
                  <span className="demo-agent-avatar" aria-hidden="true">{agent.name.slice(0, 1)}</span>
                  <span className="demo-agent-identity"><strong>{agent.name}</strong><small>{agent.role}</small></span>
                  <span className={statusClass(agent.status)}>{agent.status}</span>
                  <span className="demo-agent-activity">{agent.activity}</span>
                </button>
              ))}
            </div>
          ) : (
            <section className="demo-timeline" aria-labelledby="demo-activity-heading">
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
            <div className="demo-agent-profile-heading">
              <span className="demo-agent-avatar" aria-hidden="true">{selectedAgent.name.slice(0, 1)}</span>
              <div><h3>{selectedAgent.name}</h3><p>{selectedAgent.role}</p></div>
            </div>
            <dl>
              <div><dt>Department</dt><dd>{selectedAgent.department}</dd></div>
              <div><dt>Reports to</dt><dd>{selectedAgent.manager}</dd></div>
              <div><dt>Status</dt><dd><span className={statusClass(selectedAgent.status)}>{selectedAgent.status}</span></dd></div>
              <div><dt>Authority</dt><dd>{selectedAgent.authority}</dd></div>
              <div><dt>Risk ceiling</dt><dd>{selectedAgent.risk}</dd></div>
            </dl>
            <section><span>Current activity</span><p>{selectedAgent.activity}</p></section>
            <section><span>Recent work</span><p>{selectedAgent.recentWork}</p></section>
            <p className="demo-panel-note">Profile inspection only. This public Demo cannot enable, pause, edit, or invoke an Agent.</p>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
