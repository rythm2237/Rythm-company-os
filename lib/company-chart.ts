export type ChartDepartment = { id: string; name: string; manager_agent_id?: string | null };
export type ChartAgent = { id: string; name: string; display_name?: string | null; role_title: string; department_id: string | null; reports_to_agent_id: string | null; agent_status: string };
export type ChartMember = { user_id: string; display_name: string | null; job_title: string | null; role: string; department_id: string | null; membership_status: string | null };
export type ChartNode = { id: string; kind: "human" | "ai"; name: string; role: string; department: string; manager: string; reportsTo: string; status: string; x: number; y: number; issue: boolean };
export function buildCompanyChart(departments: ChartDepartment[], agents: ChartAgent[], members: ChartMember[]) {
  const byId = new Map(agents.map(a => [a.id, a]));
  const departmentById = new Map(departments.map(d => [d.id, d]));
  const name = (a: ChartAgent) => a.display_name || a.name;
  const cyclic = new Set<string>();
  const depth = new Map<string, number>();
  function visit(id: string, chain: string[] = []): number {
    if (depth.has(id)) return depth.get(id)!;
    const index = chain.indexOf(id);
    if (index >= 0) { chain.slice(index).forEach(key => cyclic.add(key)); return 0; }
    const parent = byId.get(id)?.reports_to_agent_id;
    const level = parent && byId.has(parent) ? 1 + visit(parent, [...chain, id]) : 0;
    depth.set(id, cyclic.has(id) ? 0 : level);
    return depth.get(id)!;
  }
  agents.forEach(a => visit(a.id));
  const groupId = (id: string | null) => id && departmentById.has(id) ? id : "unassigned";
  const activeMembers = members.filter(m => m.membership_status === "active");
  const groups = [...departments.map(d => ({ ...d, key: d.id })), { id: "unassigned", key: "unassigned", name: "Unassigned / unavailable department", manager_agent_id: null }].filter(d => d.key !== "unassigned" || agents.some(a => groupId(a.department_id) === d.key) || activeMembers.some(m => groupId(m.department_id) === d.key));
  const nodes: ChartNode[] = [];
  let x = 24;
  const lanes = groups.map(d => {
    const humans = activeMembers.filter(m => groupId(m.department_id) === d.key);
    const ai = agents.filter(a => groupId(a.department_id) === d.key);
    const levels = new Map<number, ChartAgent[]>();
    ai.forEach(a => { const level = depth.get(a.id) ?? 0; levels.set(level, [...(levels.get(level) ?? []), a]); });
    const width = Math.max(1, humans.length, ...[...levels.values()].map(a => a.length)) * 260 + 24;
    const manager = d.manager_agent_id ? (byId.has(d.manager_agent_id) ? name(byId.get(d.manager_agent_id)!) : "Manager unavailable") : "Not assigned";
    const base = { department: d.name, manager };
    humans.forEach((m, i) => nodes.push({ ...base, id: `human:${m.user_id}`, kind: "human", name: m.display_name || `User ${m.user_id.slice(0, 8)}`, role: m.job_title || m.role, reportsTo: "Not recorded", status: m.membership_status || "Unknown", x: x + 12 + i * 260, y: 116, issue: false }));
    levels.forEach((items, level) => items.forEach((a, i) => nodes.push({ ...base, id: a.id, kind: "ai", name: name(a), role: a.role_title, status: a.agent_status, reportsTo: a.reports_to_agent_id ? (byId.has(a.reports_to_agent_id) ? name(byId.get(a.reports_to_agent_id)!) : "Manager unavailable") : "No AI manager recorded", x: x + 12 + i * 260, y: 300 + level * 180, issue: cyclic.has(a.id) || Boolean(a.reports_to_agent_id && !byId.has(a.reports_to_agent_id)) })));
    const lane = { ...d, x, width, manager }; x += width + 32; return lane;
  });
  const edges = agents.filter(a => a.reports_to_agent_id && byId.has(a.reports_to_agent_id)).map(a => ({ from: a.reports_to_agent_id!, to: a.id, issue: cyclic.has(a.id) }));
  return { nodes, lanes, edges, width: Math.max(520, x), height: Math.max(420, ...nodes.map(n => n.y + 184)), issues: nodes.filter(n => n.issue).length };
}
