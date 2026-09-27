export type ChartDepartment = { id: string; name: string; manager_agent_id?: string | null; status?: string | null };
export type ChartAgent = { id: string; name: string; display_name?: string | null; role_title: string; department_id: string | null; reports_to_agent_id: string | null; agent_status: string };
export type ChartMember = { user_id: string; display_name: string | null; job_title: string | null; role: string; department_id: string | null; membership_status: string | null };
export type ChartPerson = { id: string; name: string; role: string; kind: "human" | "ai"; status: string; reportsTo: string; issue: boolean; isManager: boolean };
export type ChartBranch = { id: string; name: string; manager: ChartPerson | null; people: ChartPerson[]; issues: number };

// Department containment is not a reporting relationship. Only reports_to_agent_id
// records an AI-to-AI reporting line; the visual keeps that distinction explicit.
export function buildCompanyChart(departments: ChartDepartment[], agents: ChartAgent[], members: ChartMember[]) {
  const agentById = new Map(agents.map(agent => [agent.id, agent]));
  const activeMembers = members.filter(member => member.membership_status === "active");
  const ceo = activeMembers.find(member => member.role === "owner") ?? null;
  const humanName = (member: ChartMember) => member.display_name || `User ${member.user_id.slice(0, 8)}`;
  const agentName = (agent: ChartAgent) => agent.display_name || agent.name;
  const cycle = new Set<string>();
  for (const agent of agents) {
    const path: string[] = [];
    let cursor: string | null = agent.id;
    while (cursor && agentById.has(cursor)) {
      const index = path.indexOf(cursor);
      if (index !== -1) { path.slice(index).forEach(id => cycle.add(id)); break; }
      path.push(cursor);
      cursor = agentById.get(cursor)?.reports_to_agent_id ?? null;
    }
  }
  const person = (agent: ChartAgent, managerId?: string | null): ChartPerson => {
    const parent = agent.reports_to_agent_id ? agentById.get(agent.reports_to_agent_id) : null;
    return { id: agent.id, name: agentName(agent), role: agent.role_title, kind: "ai", status: agent.agent_status,
      reportsTo: parent ? agentName(parent) : agent.reports_to_agent_id ? "Manager unavailable" : "No reporting line recorded",
      issue: cycle.has(agent.id) || Boolean(agent.reports_to_agent_id && !parent), isManager: agent.id === managerId };
  };
  const branches: ChartBranch[] = departments.filter(department => department.status !== "archived").map(department => {
    const assigned = agents.filter(agent => agent.department_id === department.id);
    const manager = department.manager_agent_id ? assigned.find(agent => agent.id === department.manager_agent_id) : null;
    const people: ChartPerson[] = [
      ...assigned.filter(agent => agent.id !== manager?.id).map(agent => person(agent)),
      ...activeMembers.filter(member => member.department_id === department.id && member.user_id !== ceo?.user_id).map(member => ({
        id: `human:${member.user_id}`, name: humanName(member), role: member.job_title || member.role,
        kind: "human" as const, status: "active", reportsTo: "Human reporting line not recorded", issue: false, isManager: false,
      })),
    ];
    const hasInvalidManager = Boolean(department.manager_agent_id && !manager);
    return { id: department.id, name: department.name, manager: manager ? person(manager, manager.id) : null,
      people, issues: people.filter(item => item.issue).length + (manager && cycle.has(manager.id) ? 1 : 0) + (hasInvalidManager ? 1 : 0) };
  });
  const unassignedAgents = agents.filter(agent => !branches.some(branch => branch.id === agent.department_id));
  const unassignedHumans = activeMembers.filter(member => member.user_id !== ceo?.user_id && !branches.some(branch => branch.id === member.department_id));
  if (unassignedAgents.length || unassignedHumans.length) branches.push({
    id: "unassigned", name: "Not assigned to a department", manager: null,
    people: [...unassignedAgents.map(agent => person(agent)), ...unassignedHumans.map(member => ({
      id: `human:${member.user_id}`, name: humanName(member), role: member.job_title || member.role,
      kind: "human" as const, status: "active", reportsTo: "Human reporting line not recorded", issue: false, isManager: false,
    }))], issues: unassignedAgents.filter(agent => cycle.has(agent.id) || Boolean(agent.reports_to_agent_id && !agentById.has(agent.reports_to_agent_id))).length,
  });
  return { ceo: ceo ? { name: humanName(ceo), role: ceo.job_title || "Human CEO / Owner" } : null,
    branches, issues: branches.reduce((total, branch) => total + branch.issues, 0),
    positions: agents.length + activeMembers.length };
}
