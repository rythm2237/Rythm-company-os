export type ChartDepartment = { id: string; name: string; manager_agent_id?: string | null };
export type ChartAgent = { id: string; name: string; display_name?: string | null; role_title: string; department_id: string | null; reports_to_agent_id: string | null; agent_status: string };
export type ChartMember = { user_id: string; display_name: string | null; job_title: string | null; role: string; department_id: string | null; membership_status: string | null };
export type ChartNode = { id: string; kind: "human" | "ai"; name: string; role: string; department: string; manager: string; reportsTo: string; status: string; x: number; y: number; issue: boolean };

export const CHART_CARD_WIDTH = 272;
export const CHART_CARD_HEIGHT = 194;
const HORIZONTAL_GAP = 36;
const VERTICAL_STEP = 274;
const ROOT_GAP = 88;
const MARGIN = 52;

export function buildCompanyChart(departments: ChartDepartment[], agents: ChartAgent[], members: ChartMember[]) {
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  const departmentById = new Map(departments.map(department => [department.id, department]));
  const name = (agent: ChartAgent) => agent.display_name || agent.name;
  const cycle = new Set<string>();
  const visited = new Set<string>();
  function detectCycle(id: string, chain: string[] = []) {
    if (visited.has(id)) return;
    const index = chain.indexOf(id);
    if (index >= 0) { chain.slice(index).forEach(key => cycle.add(key)); return; }
    const parent = byId.get(id)?.reports_to_agent_id;
    if (parent && byId.has(parent)) detectCycle(parent, [...chain, id]);
    visited.add(id);
  }
  agents.forEach(agent => detectCycle(agent.id));

  const children = new Map<string, ChartAgent[]>();
  const roots: ChartAgent[] = [];
  for (const agent of agents) {
    const parent = agent.reports_to_agent_id;
    // A cycle is shown as disconnected roots, never as a false reporting chain.
    if (!parent || !byId.has(parent) || cycle.has(agent.id)) roots.push(agent);
    else children.set(parent, [...(children.get(parent) || []), agent]);
  }
  const widths = new Map<string, number>();
  function subtreeWidth(id: string): number {
    const branches = children.get(id) || [];
    const childrenWidth = branches.reduce((total, child) => total + subtreeWidth(child.id), 0) + Math.max(0, branches.length - 1) * HORIZONTAL_GAP;
    const width = Math.max(CHART_CARD_WIDTH, childrenWidth);
    widths.set(id, width);
    return width;
  }
  roots.forEach(root => subtreeWidth(root.id));
  const contentWidth = roots.reduce((total, root) => total + (widths.get(root.id) || CHART_CARD_WIDTH), 0) + Math.max(0, roots.length - 1) * ROOT_GAP;
  const width = Math.max(760, contentWidth + MARGIN * 2);
  const offset = (width - contentWidth) / 2;
  const nodes: ChartNode[] = [];
  let maxLevel = 0;
  function place(agent: ChartAgent, left: number, level: number) {
    const branchWidth = widths.get(agent.id) || CHART_CARD_WIDTH;
    const x = left + (branchWidth - CHART_CARD_WIDTH) / 2;
    const department = agent.department_id ? departmentById.get(agent.department_id) : null;
    const manager = department?.manager_agent_id ? (byId.has(department.manager_agent_id) ? name(byId.get(department.manager_agent_id)!) : "Manager unavailable") : "Not assigned";
    const parent = agent.reports_to_agent_id ? byId.get(agent.reports_to_agent_id) : null;
    nodes.push({ id: agent.id, kind: "ai", name: name(agent), role: agent.role_title, department: department?.name || "Unassigned", manager, reportsTo: parent ? name(parent) : agent.reports_to_agent_id ? "Manager unavailable" : "No AI manager recorded", status: agent.agent_status, x, y: 80 + level * VERTICAL_STEP, issue: cycle.has(agent.id) || Boolean(agent.reports_to_agent_id && !parent) });
    maxLevel = Math.max(maxLevel, level);
    const branches = children.get(agent.id) || [];
    const total = branches.reduce((sum, child) => sum + (widths.get(child.id) || CHART_CARD_WIDTH), 0) + Math.max(0, branches.length - 1) * HORIZONTAL_GAP;
    let childLeft = left + (branchWidth - total) / 2;
    for (const child of branches) { place(child, childLeft, level + 1); childLeft += (widths.get(child.id) || CHART_CARD_WIDTH) + HORIZONTAL_GAP; }
  }
  let left = offset;
  for (const root of roots) { place(root, left, 0); left += (widths.get(root.id) || CHART_CARD_WIDTH) + ROOT_GAP; }

  const humans: ChartNode[] = members.filter(member => member.membership_status === "active").map(member => ({
    id: `human:${member.user_id}`, kind: "human", name: member.display_name || `User ${member.user_id.slice(0, 8)}`,
    role: member.job_title || member.role, department: member.department_id ? departmentById.get(member.department_id)?.name || "Unassigned" : "Unassigned",
    manager: "Not recorded", reportsTo: "Not recorded", status: member.membership_status || "Unknown", x: 0, y: 0, issue: false,
  }));
  nodes.unshift(...humans);
  const edges = agents.filter(agent => agent.reports_to_agent_id && byId.has(agent.reports_to_agent_id) && !cycle.has(agent.id)).map(agent => ({ from: agent.reports_to_agent_id!, to: agent.id, issue: false }));
  return { nodes, edges, roots: roots.map(root => root.id), width, height: 80 + maxLevel * VERTICAL_STEP + CHART_CARD_HEIGHT + 88, issues: nodes.filter(node => node.issue).length };
}
