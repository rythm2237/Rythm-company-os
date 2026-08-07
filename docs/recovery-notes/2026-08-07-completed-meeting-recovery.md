# Completed multi-agent session recovery

This recovery addresses the first AI-PR-001 boardroom session that reached `completed` before the empty-output guard was deployed.

The migration preserves all invalid pre-hotfix turns as `system` audit records, clears invalid synthesis state, resets session execution counters, and returns the same governed session to `ready`. If the linked meeting was marked completed without a Human CEO decision, it is reopened to `running`.

The migration aborts if a `ceo_decision` message exists. No external actions are authorized.
