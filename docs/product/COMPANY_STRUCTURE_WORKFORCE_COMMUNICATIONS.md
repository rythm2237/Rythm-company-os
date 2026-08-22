# Company Structure, Workforce & Communications

## Company Profile
RYTHM organizations carry operational identity plus legal/commercial identity: legal name/entity type, registration/tax/VAT identifiers, registered/operating addresses, country, contact points, currency and timezone.

## Organization Chart
The org chart is hybrid by design. Departments may be nested. Human organization members and AI agents can both belong to departments and have reporting lines. Agent managers are supported at department level.

## Human workforce lifecycle
Organization members support job title, department, reporting line and membership lifecycle (invited, active, deactivated). Authentication remains Supabase Auth; organization membership remains the authorization boundary.

## AI workforce economics
RYTHM does not model AI-agent payroll as human payroll. Each agent has a monthly company cost, currency and cost model:
- `included`: base/bundled agent, normally zero or an allocated internal cost.
- `subscription`: the monthly amount the customer pays for that position/agent.
- `custom`: negotiated or manually assigned company cost.

This value is the agent's recurring workforce cost and should feed future Finance Center workforce-cost reporting.

## Calendar
RYTHM has an organization-scoped calendar model for human and agent participants, external invitee email, meeting links and external provider IDs. Provider-neutral fields allow Google Calendar and Microsoft calendar synchronization without making either provider the system of record.

## Notifications
Notifications are organization-scoped and user-targeted. In-app and email delivery preferences are configurable by category, digest frequency and quiet-hours metadata. Approval, communication, meeting and project notifications share one center.

## Security
All new organization-scoped tables use RLS. Calendar access is limited to organization members. Notification reading/updating is limited to the target user. Service-side notification creation remains privileged and is not granted directly to authenticated clients.
