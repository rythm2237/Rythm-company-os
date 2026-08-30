# Phase 5 GTM live benchmark incident

The first Production Senior GTM benchmark run completed all six scenarios, but five candidate outputs hit the configured 3,500-token ceiling. The independent judge therefore scored materially truncated answers. The run is preserved for audit but is not valid evidence for formal readiness.

Remediation:
- raise candidate output budget to 7,000 tokens;
- require complete executive answers within roughly 2,200 words;
- fail before scoring/persistence when the candidate approaches the output ceiling;
- expand judge candidate context;
- mark the affected Production batch invalidated and exclude invalidated batches from formal readiness while preserving all raw evidence.
