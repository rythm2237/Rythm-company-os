"use client";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { buildCompanyChart, type ChartAgent, type ChartDepartment, type ChartMember } from "@/lib/company-chart";

export default function CompanyChart({ departments, agents, members, children }: { departments: ChartDepartment[]; agents: ChartAgent[]; members: ChartMember[]; children: ReactNode }) {
  const [view, setView] = useState<"chart" | "cards">("chart");
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const arrow = useId().replace(/:/g, "");
  const graph = useMemo(() => buildCompanyChart(departments, agents, members), [departments, agents, members]);
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setZoom(Math.max(.2, Math.min(1, (width - 24) / graph.width)));
    });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [graph.width, graph.nodes.length]);
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const node = selected ? byId.get(selected) : null;
  const matches = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const fit = () => { if (frame.current) setZoom(Math.max(.2, Math.min(1, (frame.current.clientWidth - 24) / graph.width))); };
  const short = (text: string, max = 29) => text.length > max ? text.slice(0, max - 1) + "…" : text;
  return <div className="company-chart">
    <div className="company-chart-toolbar"><div className="company-view-switch" role="group" aria-label="Organization chart view"><button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>Visual chart</button><button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")}>Cards & edit</button></div><p>Human authority. Clear reporting lines.</p></div>
    <div hidden={view !== "chart"}>
      <div className="company-chart-controls"><label>Find a position<input type="search" placeholder="Name, role or department" value={query} onChange={e => setQuery(e.target.value)} /></label><div role="group" aria-label="Chart zoom"><button type="button" onClick={() => setZoom(z => Math.max(.2, z - .15))} aria-label="Zoom out">−</button><output>{Math.round(zoom * 100)}%</output><button type="button" onClick={() => setZoom(z => Math.min(1.75, z + .15))} aria-label="Zoom in">+</button><button type="button" onClick={fit}>Fit width</button><button type="button" onClick={() => { setZoom(1); setQuery(""); setSelected(null); }}>Reset</button></div></div>
      <div className="company-chart-legend"><span><i className="human" />Human</span><span><i className="ai" />AI position</span><span>Arrow: manager → direct report</span><span>No line = no recorded AI manager</span></div>
      {graph.issues ? <p className="company-chart-warning" role="status">{graph.issues} position(s) have a missing manager or a reporting cycle. Review them in Cards & edit.</p> : null}
      {!graph.nodes.length ? <p className="company-chart-empty">No workforce positions yet. Add members or create AI agents to build your organization chart.</p> : <div className="company-chart-canvas" ref={frame} tabIndex={0} role="region" aria-label="Scrollable organization chart. Use zoom controls or scroll to explore.">
        <svg width={graph.width * zoom} height={graph.height * zoom} viewBox={`0 0 ${graph.width} ${graph.height}`} aria-label="Company positions grouped by department" style={{ minWidth: graph.width * zoom, maxWidth: "none" }}>
          <defs><marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#71839a" /></marker></defs>
          {graph.lanes.map(l => <g key={l.key}><rect x={l.x} y={16} width={l.width} height={graph.height - 32} rx={18} fill="#f1f5f9" stroke="#dfe7ef" /><text x={l.x + 18} y={45} className="chart-department">{short(l.name, Math.floor(l.width / 9))}</text><text x={l.x + 18} y={69} className="chart-manager">Lead: {short(l.manager, Math.floor(l.width / 8) - 7)}</text><text x={l.x + 18} y={91} className="chart-label">{graph.nodes.filter(n => n.department === l.name).length} positions</text></g>)}
          {graph.edges.map(e => { const from = byId.get(e.from)!, to = byId.get(e.to)!; const sx = from.x + 118, sy = from.y + 142, tx = to.x + 118, ty = to.y; const mid = sy + (ty - sy) / 2; return <path key={`${e.from}-${e.to}`} d={`M ${sx} ${sy} C ${sx} ${mid}, ${tx} ${mid}, ${tx} ${ty - 5}`} fill="none" stroke={e.issue ? "#c26738" : "#71839a"} strokeWidth={selected === e.from || selected === e.to ? 3 : 1.5} strokeDasharray={e.issue ? "6 4" : undefined} markerEnd={`url(#${arrow})`} />; })}
          {graph.nodes.map(n => <g key={n.id} tabIndex={0} role="button" aria-label={`${n.name}, ${n.role}, ${n.department}. Reports to ${n.reportsTo}.`} aria-pressed={selected === n.id} onClick={() => setSelected(n.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(n.id); } }} className="company-chart-node" opacity={matches(`${n.name} ${n.role} ${n.department}`) ? 1 : .28}>
            <title>{`${n.name} · ${n.role} · ${n.department} · Reports to: ${n.reportsTo}`}</title><rect x={n.x} y={n.y} width={236} height={142} rx={12} fill="white" stroke={selected === n.id ? "#315edd" : n.issue ? "#c26738" : "#cbd5e1"} strokeWidth={selected === n.id ? 3 : 1} /><rect x={n.x} y={n.y} width={5} height={142} rx={2} fill={n.kind === "human" ? "#147d72" : "#5267d9"} />
            <text x={n.x + 16} y={n.y + 24} className={`chart-type ${n.kind}`}>{n.kind === "human" ? "HUMAN" : "AI POSITION"} · {n.status}</text><text x={n.x + 16} y={n.y + 51} className="chart-name">{short(n.name, 25)}</text><text x={n.x + 16} y={n.y + 73} className="chart-role">{short(n.role, 31)}</text><text x={n.x + 16} y={n.y + 101} className="chart-label">Reports to</text><text x={n.x + 16} y={n.y + 121} className="chart-manager">{short(n.reportsTo, 31)}</text>
          </g>)}
        </svg>
      </div>}
      {query ? <p role="status" className="company-chart-hint">{graph.nodes.filter(n => matches(`${n.name} ${n.role} ${n.department}`)).length} matching positions highlighted. Connections remain visible.</p> : <p className="company-chart-hint">Select a position for full details. Scroll horizontally to explore departments; zoom out for an overview.</p>}
      {node ? <aside className="company-position-detail" aria-label="Selected position"><div><span>{node.kind === "human" ? "Human position" : "AI position"}</span><h3>{node.name}</h3><p>{node.role}</p></div><dl><div><dt>Department</dt><dd>{node.department}</dd></div><div><dt>Department lead</dt><dd>{node.manager}</dd></div><div><dt>Reports to</dt><dd>{node.reportsTo}</dd></div><div><dt>Status</dt><dd>{node.status}</dd></div></dl><button type="button" onClick={() => setSelected(null)} aria-label="Close position details">Close</button></aside> : null}
    </div>
    <div hidden={view !== "cards"}>{children}</div>
  </div>;
}
