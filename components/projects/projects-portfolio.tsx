"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type PortfolioProject = {
  id: string;
  name: string;
  projectCode: string;
  department: string;
  manager: string;
  updated: string;
  lifecycleState: string;
  progress: number;
  nextAction: string;
  approvalCount: number;
  continuousScope: boolean;
};

type Filter = "all" | "attention" | "active" | "blocked" | "completed";
const blockedStates = new Set(["BLOCKED", "ON_HOLD", "PAUSED", "WAITING_FOR_DATA"]);
const terminalStates = new Set(["COMPLETED", "CANCELLED", "FAILED", "ARCHIVED"]);

function statusText(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, character => character.toUpperCase());
}

function readableDate(date: string): string {
  const time = new Date(date);
  return Number.isNaN(time.valueOf()) ? "Unknown" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(time);
}

export function ProjectsPortfolio({ projects }: { projects: PortfolioProject[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const visible = useMemo(() => projects.filter(project => {
    const query = search.trim().toLowerCase();
    const matches = !query || [project.name, project.projectCode, project.department, project.manager].some(value => value.toLowerCase().includes(query));
    if (!matches) return false;
    if (filter === "attention") return project.approvalCount > 0 || blockedStates.has(project.lifecycleState);
    if (filter === "blocked") return blockedStates.has(project.lifecycleState);
    if (filter === "completed") return terminalStates.has(project.lifecycleState);
    if (filter === "active") return !blockedStates.has(project.lifecycleState) && !terminalStates.has(project.lifecycleState);
    return true;
  }), [projects, search, filter]);

  return <section className="panel panel-wide" style={{ marginTop: 18 }} aria-label="Project portfolio">
    <div className="panel-heading"><div><p className="label">Portfolio</p><h2>All projects</h2><p className="security-note">Find a project or focus on what needs attention.</p></div><span className="pill">{visible.length} of {projects.length}</span></div>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 12, marginBottom: 16 }}>
      <label style={{ flex: "1 1 230px", maxWidth: 420 }}>Search projects
        <input type="search" aria-label="Search projects" value={search} onChange={event => setSearch(event.target.value)} placeholder="Project name, code or team…" />
      </label>
      <div role="group" aria-label="Filter projects" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {([["all", "All"], ["attention", "Needs attention"], ["active", "Active"], ["blocked", "Blocked"], ["completed", "Closed"]] as const).map(([value, title]) =>
          <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={filter === value ? "primary-button" : "secondary-button"} style={{ padding: "8px 12px", cursor: "pointer" }}>{title}</button>)}
      </div>
    </div>
    {visible.length === 0 ? <p className="empty-state">{projects.length === 0 ? "No projects yet. Create a project to get started." : "No projects match these filters."}</p> :
      <div className="data-list">{visible.map(project => <Link className="data-row simple-project-row" href={`/projects/operating?project=${project.id}`} key={project.id}>
        <div style={{ minWidth: 0 }}>
          <strong>{project.name}</strong>
          <span>{project.department} · {project.manager} · Updated {readableDate(project.updated)}</span>
          {project.continuousScope ? <small>Ongoing optimization scope · delivery progress and operating health are separate</small> : null}
          <small>Next: {project.nextAction}{project.approvalCount ? ` · ${project.approvalCount} approval(s) need attention` : ""}</small>
        </div>
        <div className="simple-project-status"><span className="pill">{statusText(project.lifecycleState)}</span>
          {project.continuousScope ? <small>Current delivery: {project.progress}%</small> : <strong>{project.lifecycleState === "COMPLETED" ? "Complete" : `${project.progress}%`}</strong>}
        </div>
      </Link>)}</div>}
  </section>;
}
