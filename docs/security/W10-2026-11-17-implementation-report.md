# W10 implementation evidence, 2026-11-17

W10 remains OPEN. The complete Agency delivery acceptance has not been established.

Baseline main was re-resolved as 55a1377e348c2d9ac0082c8b1f3acbba26acbc45. The production alias was previously resolved to dpl_5u6eirwziYrg3pk5gFbY89M4mH3f at the same commit. The current work targets PR #457 on pilot/w10-agency-e2e.

Verified browser evidence is Actions run 44147533206, commit 5783128d30fa94ed4834108199f567ee5a9ce2cd. The workflow completed successfully on a disposable local Supabase stack in GitHub Actions.

https://github.com/rythm2237/Rythm-company-os/actions/runs/44147533206

Desktop and Pixel 7 replay both verified the following.

- Actual signup, locally captured confirmation email, and company reservation through the application.
- Pending entitlement, selected Agency template, and Owner membership persisted across a fresh login.
- Synthetic invoice confirmation through the platform-admin RPC and an active entitlement. All invoice records existed only inside the disposable database.
- Agency installation through the template UI and persisted installation record.
- Customer and brief creation through CRM, explicit customer-scoped contract grants through the Owner UI, contract creation, and linked project creation with one accountable manager.
- Operating project page and its reload, action creation, transition to in_progress, and action page refresh.
- Project/customer/contract linkage read from persisted database rows, followed by project visibility through CRM after a new authenticated browser context.
- A separate viewer could read the customer but could neither read nor create its contract.
- The second Agency Owner could not read the first Agency's project/customer or mutate its project. These assertions run before the mobile journey.

Implemented changes include the following.

| Path | Behavior |
| --- | --- |
| supabase/migrations/20261117125000_assisted_activation_integration_department.sql | Narrow nested-trigger allowance for platform-admin activation provisioning of the Integration Department and the governed RYTHM-COMMS agent. Other guarded writes continue to require active tenant membership. |
| supabase/migrations/20261117125500_agency_template_marketing_specializations.sql | Bind existing role-specific marketing specializations for new Agency installations. |
| supabase/migrations/20261117130000_crm_contract_customer_scope.sql | Evaluate explicit customer grants directly on the proposed contract row during insert and read. |
| supabase/migrations/20261117140000_project_workflow_read_grants.sql | Grant authenticated reads of the security-invoker operating timeline and existing RLS-protected workflow tables. |
| app/(app)/crm/actions.ts | Log only the contract-save database error code. |
| scripts/validate-w10-agency-entry.mjs | Public desktop/mobile Agency selection and reload smoke. |
| scripts/validate-w10-agency-reservation.mjs | Authenticated Agency, CRM, project, task and role checks described above. |
| .github/workflows/w10-disposable-schema.yml | Fresh local Auth/Postgres/Storage, application build, browser execution and always-run destruction. |

The disposable schema is a scoped reconstruction. The workflow explicitly renumbers legacy suffixed migrations, orders preflights, supplies a synthetic historical seed identity, omits the historical live-tenant workforce transfer and unrelated 2nya migrations, applies the later preview status to an incomplete Web Development template, omits references to absent hosted-only functions, and omits an owner-only Storage policy comment. It also supplies explicit local Data API grants under existing RLS. Passing this environment does not establish exact hosted-schema parity.

Executed verification included node --check on the browser scripts, npm run typecheck, npm run lint, npm run test:commercial-payment, npm run test:crm-sales and npm run test:enterprise-crm. These commands completed successfully. Lint reported zero errors and 64 warnings. The Actions workflow executed the Next production build and Playwright browser script successfully.

Remaining acceptance status follows.

| Acceptance criterion | Status |
| --- | --- |
| Full Agency path completes without developer intervention | FAIL / not fully verified. Automated flow reaches a persisted task, but meeting, approval and generated delivery have not been replayed end to end. |
| Every persisted record survives refresh and belongs to the right tenant | FAIL / incomplete coverage. The tested Agency, CRM, project and action slice passed. Meeting, approval and generated artifacts remain unverified. |
| No critical navigation, state or permissions defects | FAIL / incomplete coverage. Tested paths and role boundaries passed. The remaining delivery surfaces need browser coverage. |

The project autonomous meeting implementation calls the AI request gateway and rejects an absent provider/model at lib/projects/project-autonomous-meetings.ts:51. The current workflow deliberately has Agent execution and external actions disabled and injects no provider credential. An actual model-backed meeting and generated artifact run requires an explicitly approved API budget under task safety rule 3 and server-side test configuration. The manual meeting wizard also assumes an enabled B-001, which has not been established for the new Agency installation. The project-native meeting path supports assigned project agents and still needs E2E verification.

Rollback for this work is to close the unmerged draft PR or discard its branch. No production schema, deployment or customer record was changed. The disposable Actions services were stopped by the cleanup step.

Human review before release must confirm the following.

- Review the activation trigger exception and its authorization boundaries.
- Review customer-scoped contract policies and scoped workflow read grants.
- Complete the meeting, Human CEO approval and generated artifact browser journey.
- Review screenshots or traces and persisted records for the full desktop/mobile journey.
- Check hosted staging parity and run the release-dependency checks for W03 and W08.
- Provide separate owner approval before a merge, production migration or production deployment.
