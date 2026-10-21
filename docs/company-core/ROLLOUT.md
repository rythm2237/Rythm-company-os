# Migration, verification and rollback

The migration is additive and transactional. It does not delete history, reset project executions, approve decisions, enable paused agents, send emails or replay external actions.

Backfill creates/reuses accountable directors, reconciles department reporting, records project obligations, and disables the enabled flag on explicitly paused/archived agents. Snapshot rows retain original enabled/reporting/department manager values. Review existing company ownership, manager choices and access after application.

Release order:
1. Review synthetic tests, typecheck, lint and build plus the full release limitations in IMPLEMENTATION.md.
2. Run migration against an isolated database containing the current relevant schema, including existing triggers and RLS. Validate future installation and current backfill.
3. Validate preview UI and both full scenario suites.
4. Apply transactional migration; verify schema, relationships, worker RPC permissions and advisors.
5. Release reviewed commit; verify actual deployed SHA and authenticated runtime flows.
6. Keep historical no_external_action proposals under manager review; confirm no existing external result would be replayed before explicitly resuming them.

Rollback: restore the previous application commit, revoke form links and stop newly introduced work without deleting evidence. Do not remove schema tables containing decisions, submissions or cost receipts. For initial reporting/enable backfill only, use the snapshot in a reviewed transaction and restore reporting values only where they still match the migrated value; do not restore a contradictory enabled=true/paused state; retain subsequent intentional manager changes. Remove the new claim guard only after restoring the matching old worker. Never release uncertain cost reservations or replay external calls as part of rollback.

Detailed scenario evidence and limitations are in VERIFICATION.md.

Verification performed locally: synthetic PGlite SQL ownership and future installation, budget concurrency/idempotency/reconciliation, customer submission revisions and manager review, private-table/RPC access, atomic follow-up/approval reservation, definitive rejection obligation; leased automatic planning and proposal translation, deterministic task continuity, JSDOM customer form controls/resume/duplicate guards, deterministic graph, availability, answer validation and executive evaluation scoring; repository project OS/supervisor/completion/tenant-email/software-template checks; TypeScript; lint; production build.

Not verified by these checks: live email delivery, actual provider mutations/receipts, live model performance, full browser journeys, recurring service closeout, production application of the new migration or deployment of this branch. Track actual rollout separately; never infer it from passing checks.
