# RYTHM AI Workspace migration map

Target: `/ai` inside the existing RYTHM application shell.

| Source capability | RYTHM destination | Decision |
|---|---|---|
| AI chat / OpenAI | `lib/ai/request-gateway.ts` + `/api/ai-workspace/chat` | Reuse RYTHM AI Gateway; adapt source workspace UX |
| Auto/Fast/Best | RYTHM adaptive routing + workspace preference | Reuse/adapt |
| Professional Prompt Mode | Two independently reserved calls through RYTHM AI Gateway | Adapt; enhanced prompt remains internal |
| Provider usage | `ai_routing_decisions` + `ai_usage_requests` | Reuse telemetry; add usage-accounting state |
| Prepaid credit | shared `usage_wallets` + immutable `usage_ledger` | New shared usage ledger; existing provider billing remains canonical |
| Projects/conversations/messages | `aiw_*` personal workspace tables | Adapt |
| Knowledge/memory/files | personal `aiw_*`; existing company knowledge/memory remains canonical | Adapt without duplicating company stores |
| Plugins | `integration_providers` + `organization_integrations` | Reuse existing connector layer |
| Tool execution | `tool_execution_requests` + `approval_requests` | Reuse existing execution/approval gateway |
| Company/agents | existing `company_templates`, `agent_templates`, `agents` | Reuse; no duplicate agent system |
| Agent commercial layer | `agent_commercial_contracts`, `agent_trials` + existing Billing | Extend |
| Guest | `aiw_guest_codes` / `aiw_guest_sessions` + usage ledger | Adapt |
| Admin AI | existing RYTHM Admin auth/shell | Extend in later migration batch |

## Security boundaries

All new AI Workspace tables have RLS enabled and direct `anon`/`authenticated` CRUD revoked. Application access is server-mediated after Supabase Auth verification. Existing RYTHM organization membership remains the authoritative organization boundary. Connector actions continue through the existing execution gateway and approval model.

## Commercial boundaries

Subscription/provider-payment records remain in the existing RYTHM Billing domain. `usage_wallets` and immutable `usage_ledger` represent prepaid/allocated AI consumption only. Agent subscription charges and AI usage are separate transaction concepts.
