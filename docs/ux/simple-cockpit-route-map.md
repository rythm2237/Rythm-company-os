# Simple cockpit route migration

The five primary workspace destinations are `/home`, `/projects`, `/inbox`, `/company`, and `/reports`. `/settings` is secondary; `/admin` is visible only to platform administrators. Existing pages and APIs remain live for deep links.

| Existing destination | New context | Compatibility |
| --- | --- | --- |
| `/command-center`, `/ai` | Home / advanced AI workspace | Existing routes retained |
| `/projects`, `/projects/operating` | Projects, with Overview, Roadmap, Work, Activity, Decisions, Files, Results, Advanced | Existing `view=tasks/actions/approvals/agents/live` maps to contextual tabs |
| `/actions`, `/workflow/traceability` | Project Work / Advanced | Existing URLs retained |
| `/attention` | Inbox | Redirects to `/inbox` |
| `/approvals`, `/approvals/decisions`, `/decisions`, `/ideas` | Inbox; project-specific approval in Project Decisions | Existing actionable URLs retained |
| `/company`, `/agents`, `/studio/agents`, `/studio/templates`, `/studio/builder`, `/meetings` | My AI Company / project governance | Existing URLs retained |
| `/executive-review`, `/finance`, `/evaluations`, `/agency/seo`, `/operations/health` | Reports | Existing URLs retained |
| `/integrations`, `/notifications`, `/billing`, `/company/profile`, `/company-library` | Settings | Existing URLs retained; `/settings/integrations` redirects to `/integrations` |
| `/admin/**` | Admin | Role-gated pages remain; navigation shown only to platform admin |
| Other specialized tools (`/crm`, `/calendar`, `/communication`, `/runtime`, etc.) | Existing contextual links in related pages | Existing URLs retained pending workflow-specific consolidation |

## Execution boundary

The Home command creates a planning project, runs existing project analysis, and drafts a roadmap for review. It does not fabricate progress or authorize external execution. If planning fails, the saved project remains recoverable in Roadmap. The established project dispatcher and approval endpoint handle ongoing work. A project-specific Inbox approval opens the project decision surface so approval can release the dependent task.

## Remaining product work

The existing project intake still lacks a customer-facing secure form and email dispatch. Some older generic approvals and decisions do not release a project task automatically; their legacy actions remain accessible, but they must not be presented as a verified end-to-end resume flow. Unified important communication needs classification and a human-attention source, rather than copying all mail into Inbox. Department pages and global command search remain to be built.
