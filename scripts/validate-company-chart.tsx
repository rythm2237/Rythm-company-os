import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { buildCompanyChart, type ChartAgent } from "../lib/company-chart";
import CompanyChart from "../components/company-branding/CompanyChart";
import CompanyDisclosure from "../components/company-branding/CompanyDisclosure";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const departments = [{id:"creative",name:"Creative",manager_agent_id:"a"},{id:"accounts",name:"Accounts"}];
const agents: ChartAgent[] = [
  {id:"a",name:"Director",role_title:"Creative director",department_id:"creative",reports_to_agent_id:null,agent_status:"enabled"},
  {id:"b",name:"Designer",role_title:"Visual designer",department_id:"creative",reports_to_agent_id:"a",agent_status:"paused"},
  {id:"c",name:"Strategist",role_title:"Account strategy",department_id:"accounts",reports_to_agent_id:"a",agent_status:"enabled"},
];
const members = [{user_id:"human",display_name:"Human CEO",job_title:"CEO",role:"owner",department_id:null,membership_status:"active"}];
const graph = buildCompanyChart(departments,agents,members);
assert.equal(graph.ceo?.name,"Human CEO");
assert.equal(graph.branches.length,2);
assert.equal(graph.branches[0].manager?.name,"Director");
assert.equal(graph.branches[0].people[0].reportsTo,"Director");
assert.equal(graph.branches[1].manager,null,"An unassigned department cannot fabricate a manager");
assert.equal(graph.branches[1].people[0].reportsTo,"Director","Cross-department reporting must remain explicit");
assert.equal(buildCompanyChart([],[],[]).branches.length,0);
assert.equal(buildCompanyChart([],[],[{...members[0],membership_status:"removed"}]).ceo,null);
const invalid = buildCompanyChart(departments,agents.map((agent,index)=>({...agent,reports_to_agent_id:index===0?"b":index===1?"a":"missing"})),members);
assert.equal(invalid.issues,3);
const html = renderToStaticMarkup(<CompanyChart departments={departments} agents={agents} members={members} actions={[{id:"task",title:"Campaign",status:"in_progress",assigned_agent_id:"b"}]} canTrack><form><input defaultValue="preserved form" /></form></CompanyChart>);
assert.match(html,/aria-pressed="true">Organization chart/);
assert.match(html,/HUMAN AUTHORITY/); assert.match(html,/DEPARTMENT MANAGER/); assert.match(html,/DEPARTMENT MEMBERS/);
assert.match(html,/No manager assigned/); assert.match(html,/Campaign/); assert.match(html,/actions\?action=task/);
assert.match(html,/preserved form/); assert.match(html,/hidden=""/);
const closed = renderToStaticMarkup(<CompanyDisclosure id="official" number="01" title="Official identity" description="Profile" meta="Owner"><input aria-label="Private field" /></CompanyDisclosure>);
assert.match(closed,/aria-expanded="false"/); assert.match(closed,/inert=""/);
const css = readFileSync("app/company-dashboard.css","utf8"); assert.match(css,/grid-template-rows: 0fr/); assert.match(css,/prefers-reduced-motion: reduce/); assert.match(css,/company-pyramid-departments/);
const page = readFileSync("app/(app)/company/page.tsx","utf8"); assert.equal((page.match(/<CompanyDisclosure /g)||[]).length,4);
for(const action of ["updateCompanyProfile","createDepartment","updateDepartmentManager","createTeam","inviteMember","updateMember","updateAgentStructure","updateAgentCost"]) assert.ok(page.includes(`action={${action}}`));
assert.match(page,/\.eq\("organization_id", organizationId\)\.eq\("department_id", departmentId\)\.eq\("id", managerId\)/);
console.log("PASS human CEO pyramid, department manager assignment, cross-department reporting, honest workflow, tenant validation, accessible cards");
