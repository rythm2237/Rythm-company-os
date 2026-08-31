# Phase 5 GTM mobile retry hardening

The Senior GTM benchmark client retries transient mobile/Safari/WebView network failures up to three times. Server-side idempotency remains authoritative, so a retry reuses already persisted scenario evidence instead of duplicating it. Completed scenarios are skipped when a run resumes.
