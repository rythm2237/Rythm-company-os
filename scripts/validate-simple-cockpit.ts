import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const app = "app/(app)";
for (const path of ["home", "projects", "inbox", "company", "reports", "settings", "more", "admin"]) {
  assert.ok(existsSync(`${app}/${path}/page.tsx`), `Missing ${path} route`);
}
const nav = read("components/product-nav/ProductNav.tsx");
const primary = nav.slice(nav.indexOf('label: "Workspace"'), nav.indexOf('label: "", items:'));
for (const path of ["/home", "/projects", "/inbox", "/company", "/reports"]) assert.match(primary, new RegExp(`href: "${path}"`));
assert.ok(!primary.includes('href: "/admin"'), "Platform administration is not primary navigation");
assert.ok(nav.includes('access.platformAdmin'), "Admin link must be role-gated");
assert.ok(nav.includes('organizations.length > 1'), "Company switch should only appear for multiple memberships");
assert.ok(nav.includes('item.href !== "/reports"'), "Mobile reports belong under More");

const middleware = read("middleware.ts");
for (const path of ["/home", "/inbox", "/reports", "/settings", "/more"]) {
  assert.ok(middleware.includes(`"${path}"`), `${path} needs auth middleware`);
  assert.ok(middleware.includes(`"${path}/:path*"`), `${path} needs a middleware matcher`);
}
assert.match(read(`${app}/attention/page.tsx`), /redirect\("\/inbox"\)/);
const project = read(`${app}/projects/operating/page.tsx`);
for (const oldView of ["live", "agents", "tasks", "approvals", "actions"]) assert.match(project, new RegExp(`${oldView}:`));
assert.match(project, /getLatestProjectRoadmap/);
assert.match(project, /progress\.hasApprovedRoadmap/);
const home = read(`${app}/home/actions.ts`);
assert.ok(home.indexOf("analyzeProjectOS") < home.indexOf("createProjectRoadmapDraft"), "Analyze before roadmap draft");
assert.match(home, /progress_percent: 0/);
assert.ok(!home.includes("startProjectExecutionWithoutGlobalGate"), "The Home request cannot bypass roadmap approval");
const inbox = read(`${app}/inbox/page.tsx`);
assert.match(inbox, /project_clarification_requests/);
assert.match(inbox, /requires_manager_attention/);
assert.match(inbox, /view=decisions/);
const approval = read(`${app}/approvals/page.tsx`);
assert.match(approval, /approval\.subject_type === "project_task" && approval\.project_id/);
console.log("Simple cockpit route, security, planning and approval compatibility checks passed.");
