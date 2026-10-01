"use client";

import { Button } from "@/components/ui/Button";

import { useMemo, useState, type ReactNode } from "react";
import { buildCompanyChart, type ChartAgent, type ChartDepartment, type ChartMember, type ChartPerson } from "@/lib/company-chart";

type ActionSummary = { id: string; title: string; status: string; assigned_agent_id: string | null };

function Person({ person, selected, onSelect }: { person: ChartPerson; selected: boolean; onSelect: () => void }) {
  return <Button type="button" className={`company-pyramid-person ${person.isManager ? "is-manager" : ""} ${person.issue ? "has-issue" : ""}`}
    aria-pressed={selected} onClick={onSelect}>
    <span className="company-pyramid-avatar" aria-hidden="true">{person.name.slice(0, 2).toUpperCase()}</span>
    <span className="company-pyramid-person-label"><strong>{person.name}</strong><small>{person.role}</small></span>
    <span className="company-pyramid-type">{person.kind === "ai" ? "AI" : "Human"}</span>
  </Button>;
}

export default function CompanyChart({ departments, agents, members, actions = [], canTrack = false, children }: { departments: ChartDepartment[]; agents: ChartAgent[]; members: ChartMember[]; actions?: ActionSummary[]; canTrack?: boolean; children: ReactNode }) {
  const [view, setView] = useState<"chart" | "cards">("chart");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const graph = useMemo(() => buildCompanyChart(departments, agents, members), [departments, agents, members]);
  const person = graph.branches.flatMap(branch => [branch.manager, ...branch.people]).find(item => item?.id === selected);
  const matches = (name: string) => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());

  return <div className="company-chart">
    <div className="company-chart-toolbar"><div className="company-view-switch" role="group" aria-label="Organization chart view"><Button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>Organization chart</Button><Button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")}>Cards &amp; edit</Button></div><p>Department placement and reporting lines are shown separately.</p></div>
    <div hidden={view !== "chart"} className="company-chart-view">
      <div className="company-pyramid-intro"><div><span className="company-org-eyebrow">ORGANIZATION / AUTHORITY</span><h3>Who leads whom</h3><p>Human authority at the top; departments, their appointed managers and the people inside each department below.</p></div><label className="company-org-search"><span>Find a department or position</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search the organization" /></label></div>
      <div className="company-pyramid-root" aria-label="Human CEO / Owner"><span className="company-pyramid-root-kicker">HUMAN AUTHORITY</span><strong>{graph.ceo?.name ?? "No active owner recorded"}</strong><span>{graph.ceo?.role ?? "Human CEO / Owner"}</span></div>
      <div className="company-pyramid-spine" aria-hidden="true" />
      {!graph.branches.length ? <p className="company-chart-empty">No departments or positions yet. Create a department to build the organization.</p> : <div className="company-pyramid-scroll" role="region" tabIndex={0} aria-label="Department hierarchy; scroll horizontally to explore">
        <div className="company-pyramid-departments">{graph.branches.map(branch => {
          const visible = matches(branch.name) || branch.manager && matches(branch.manager.name) || branch.people.some(item => matches(item.name) || matches(item.role));
          const departmentActions = actions.filter(action => agents.some(agent => agent.id === action.assigned_agent_id && agent.department_id === branch.id));
          return <section className={`company-pyramid-branch ${visible ? "" : "is-dimmed"}`} key={branch.id} aria-label={`${branch.name} department`}>
            <header className="company-pyramid-department"><span>DEPARTMENT</span><h4>{branch.name}</h4><small>{branch.people.length + (branch.manager ? 1 : 0)} positions</small></header>
            <div className="company-pyramid-line" aria-hidden="true" />
            <div className="company-pyramid-manager"><span className="company-pyramid-tier">DEPARTMENT MANAGER</span>{branch.manager ? <Person person={branch.manager} selected={selected === branch.manager.id} onSelect={() => setSelected(branch.manager!.id)} /> : <div className="company-pyramid-vacancy">No manager assigned <span>Assign one in Structure to establish the routing layer.</span></div>}</div>
            <div className="company-pyramid-line" aria-hidden="true" />
            <div className="company-pyramid-team"><span className="company-pyramid-tier">DEPARTMENT MEMBERS</span>{branch.people.length ? branch.people.map(item => <Person key={item.id} person={item} selected={selected === item.id} onSelect={() => setSelected(item.id)} />) : <p>No members assigned yet.</p>}</div>
            {canTrack && departmentActions.length ? <div className="company-pyramid-task-list"><strong>RECENT ASSIGNED ACTIONS</strong>{departmentActions.slice(0, 3).map(action => <a key={action.id} href={`/actions?action=${action.id}&status=${action.status}`}><span>{action.title}</span><small>{action.status.replaceAll("_", " ")}</small></a>)}</div> : null}
          </section>;
        })}</div>
      </div>}
      <p className="company-chart-hint">Department containment shows where a person works; it does not invent a reporting line. Select a position to inspect its recorded manager. Scroll horizontally for more departments.</p>
      {graph.issues ? <p className="company-chart-warning" role="status">{graph.issues} reporting relationship(s) need attention: a missing manager or a cycle. Check Cards &amp; edit.</p> : null}
      {person ? <aside className="company-position-detail" aria-label="Selected position"><div><span>{person.isManager ? "Department manager" : `${person.kind === "ai" ? "AI" : "Human"} position`}</span><h3>{person.name}</h3><p>{person.role}</p></div><dl><div><dt>Recorded reports to</dt><dd>{person.reportsTo}</dd></div><div><dt>Status</dt><dd>{person.status}</dd></div></dl><Button type="button" onClick={() => setSelected(null)}>Close</Button></aside> : null}
      <section className="company-pyramid-workflow" aria-label="Intended operating flow"><div><span className="company-org-eyebrow">OPERATING MODEL</span><h3>How a request should move</h3><p>This is the intended route. The action register currently tracks status; manager review, revision loops, cross-department handoff and resource escalation are not yet enforced automatically.</p></div><ol><li><strong>CEO brief</strong><span>Choose a department and define the outcome.</span></li><li><strong>Manager triage</strong><span>Assign the right agent and clarify the work.</span></li><li><strong>Agent execution</strong><span>Complete the task and return evidence.</span></li><li><strong>Manager review</strong><span>Accept it or request a revision from the agent.</span></li><li><strong>Handoff or escalation</strong><span>Refer to another department, request a meeting or resources when needed.</span></li><li><strong>CEO visibility</strong><span>Track progress and receive the reviewed result.</span></li></ol><div className="company-pyramid-links">{canTrack ? <a href="/actions">Track existing action items →</a> : null}<a href="/meetings/room">Open meetings →</a></div></section>
    </div>
    <div hidden={view !== "cards"} className="company-chart-cards-view">{children}</div>
  </div>;
}
