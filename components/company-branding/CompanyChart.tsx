"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { buildCompanyChart, CHART_CARD_HEIGHT, CHART_CARD_WIDTH, type ChartAgent, type ChartDepartment, type ChartMember, type ChartNode } from "@/lib/company-chart";

function PositionCard({ node, selected, dimmed, onSelect, inMap = false }: { node: ChartNode; selected: boolean; dimmed: boolean; onSelect: () => void; inMap?: boolean }) {
  return <button type="button" className={`company-org-card ${node.kind} ${selected ? "is-selected" : ""} ${dimmed ? "is-dimmed" : ""} ${node.issue ? "has-issue" : ""}`}
    style={inMap ? { left: node.x, top: node.y, width: CHART_CARD_WIDTH, minHeight: CHART_CARD_HEIGHT } : undefined}
    aria-pressed={selected} aria-label={`${node.name}, ${node.role}, ${node.department}. Reports to: ${node.reportsTo}.`} onClick={onSelect}>
    <span className="company-org-card-top"><span className="company-org-avatar" aria-hidden="true">{node.name.trim().slice(0, 2).toUpperCase()}</span><span className="company-org-kind">{node.kind === "human" ? "HUMAN" : "AI POSITION"}</span><span className="company-org-status">{node.status}</span></span>
    <strong title={node.name}>{node.name}</strong><span className="company-org-role" title={node.role}>{node.role}</span>
    <span className="company-org-card-bottom"><span className="company-org-department" title={node.department}>{node.department}</span><span className="company-org-reports" title={`Reports to: ${node.reportsTo}`}>{node.kind === "human" ? "Human authority" : `↳ ${node.reportsTo}`}</span></span>
  </button>;
}

export default function CompanyChart({ departments, agents, members, children }: { departments: ChartDepartment[]; agents: ChartAgent[]; members: ChartMember[]; children: ReactNode }) {
  const [view, setView] = useState<"chart" | "cards">("chart");
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const headingId = useId().replace(/:/g, "");
  const graph = useMemo(() => buildCompanyChart(departments, agents, members), [departments, agents, members]);
  const byId = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph]);
  const humanNodes = graph.nodes.filter(node => node.kind === "human");
  const aiNodes = graph.nodes.filter(node => node.kind === "ai");
  const search = query.trim().toLocaleLowerCase();
  const matches = (node: ChartNode) => !search || `${node.name} ${node.role} ${node.department}`.toLocaleLowerCase().includes(search);
  const selectedNode = selected ? byId.get(selected) : null;
  const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const move = (distance: number) => frame.current?.scrollBy({ left: distance, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  const focusNode = (node: ChartNode) => frame.current?.scrollTo({ left: Math.max(0, (node.x + CHART_CARD_WIDTH / 2) * zoom - frame.current.clientWidth / 2), top: Math.max(0, node.y * zoom - 70), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  useEffect(() => {
    const root = graph.roots[0];
    const first = root ? byId.get(root) : null;
    if (first && frame.current) frame.current.scrollLeft = Math.max(0, first.x + CHART_CARD_WIDTH / 2 - frame.current.clientWidth / 2);
  }, [graph, byId]);
  const findFirst = () => { const first = aiNodes.find(matches); if (first) { setSelected(first.id); focusNode(first); } };

  return <div className="company-chart">
    <div className="company-chart-toolbar"><div className="company-view-switch" role="group" aria-label="Organization chart view"><button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>Visual chart</button><button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")}>Cards &amp; edit</button></div><p>Explore the organization. Edit positions in Cards &amp; edit.</p></div>
    <div hidden={view !== "chart"} className="company-chart-view">
      {humanNodes.length ? <section className="company-org-leadership" aria-label="Human workforce"><div className="company-org-leadership-heading"><span className="company-org-eyebrow">HUMAN GOVERNANCE</span><h3>People behind the company</h3><p>Human reporting lines are not recorded; no reporting connection is assumed.</p></div><div className="company-org-human-list">{humanNodes.map(node => <PositionCard key={node.id} node={node} selected={selected === node.id} dimmed={!matches(node)} onSelect={() => setSelected(node.id)} />)}</div></section> : null}
      <div className="company-org-section-head"><div><span className="company-org-eyebrow">ORGANIZATION MAP</span><h3 id={headingId}>Reporting hierarchy</h3><p>Every connector represents a recorded manager → direct report relationship.</p></div><span className="company-org-count">{aiNodes.length} AI positions</span></div>
      <div className="company-chart-controls"><label className="company-org-search"><span>Find a position</span><input type="search" placeholder="Name, role or department" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") findFirst(); }} /></label><div className="company-org-control-group" role="group" aria-label="Navigate organization chart"><button type="button" aria-label="Scroll chart left" onClick={() => move(-Math.max(280, (frame.current?.clientWidth || 0) * .7))}>←</button><button type="button" aria-label="Scroll chart right" onClick={() => move(Math.max(280, (frame.current?.clientWidth || 0) * .7))}>→</button><button type="button" onClick={() => { const first = graph.roots[0] ? byId.get(graph.roots[0]) : null; if (first) focusNode(first); }}>Center</button><span className="company-org-control-divider"/><button type="button" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, +(value - .15).toFixed(2)))} aria-label="Zoom out">−</button><output aria-label="Zoom level">{Math.round(zoom * 100)}%</output><button type="button" disabled={zoom >= 1.6} onClick={() => setZoom(value => Math.min(1.6, +(value + .15).toFixed(2)))} aria-label="Zoom in">+</button></div></div>
      {graph.issues ? <p className="company-chart-warning" role="status">{graph.issues} position(s) have a missing manager or a reporting cycle. Check their details in Cards &amp; edit.</p> : null}
      {!aiNodes.length ? <p className="company-chart-empty">No AI positions yet. Add an agent to see the reporting hierarchy.</p> : <div className="company-org-frame"><div className="company-chart-canvas" ref={frame} tabIndex={0} role="region" aria-labelledby={headingId}>
        <div className="company-org-surface" style={{ width: graph.width * zoom, height: graph.height * zoom }}><div className="company-org-map" style={{ width: graph.width, height: graph.height, transform: `scale(${zoom})` }}>
          <svg className="company-org-connectors" width={graph.width} height={graph.height} aria-hidden="true"><defs><marker id={`${headingId}-arrow`} markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="none" stroke="#7892b1" strokeWidth="1.5"/></marker></defs>{graph.edges.map(edge => { const from = byId.get(edge.from)!; const to = byId.get(edge.to)!; const sx = from.x + CHART_CARD_WIDTH / 2, sy = from.y + CHART_CARD_HEIGHT, tx = to.x + CHART_CARD_WIDTH / 2, ty = to.y; const mid = (sy + ty) / 2; return <path key={`${edge.from}-${edge.to}`} d={`M${sx} ${sy} V${mid} H${tx} V${ty - 7}`} fill="none" stroke={selected === edge.from || selected === edge.to ? "#5267d9" : "#a8b9cf"} strokeWidth={selected === edge.from || selected === edge.to ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#${headingId}-arrow)`}/>; })}</svg>
          {aiNodes.map(node => <PositionCard key={node.id} node={node} selected={selected === node.id} dimmed={!matches(node)} inMap onSelect={() => setSelected(node.id)} />)}
        </div></div>
      </div><span className="company-org-edge" aria-hidden="true"/></div>}
      <p role="status" className="company-chart-hint">{search ? `${graph.nodes.filter(matches).length} matching positions highlighted. Press Enter to focus the first.` : "Cards stay at readable size. Scroll inside the chart, or use the arrows to explore the full hierarchy."}</p>
      {selectedNode ? <aside className="company-position-detail" aria-label="Selected position"><div><span>{selectedNode.kind === "human" ? "Human position" : "AI position"}</span><h3>{selectedNode.name}</h3><p>{selectedNode.role}</p></div><dl><div><dt>Department</dt><dd>{selectedNode.department}</dd></div><div><dt>Department lead</dt><dd>{selectedNode.manager}</dd></div><div><dt>Reports to</dt><dd>{selectedNode.reportsTo}</dd></div><div><dt>Status</dt><dd>{selectedNode.status}</dd></div></dl><button type="button" onClick={() => setSelected(null)} aria-label="Close position details">Close</button></aside> : null}
    </div>
    <div hidden={view !== "cards"} className="company-chart-cards-view">{children}</div>
  </div>;
}
