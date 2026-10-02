# D1 schema migration notes

This migration mirrors the current Donya/2nya Supabase schema while adapting PostgreSQL-specific behavior to Cloudflare D1 / SQLite.

Key adaptations:
- UUID columns are stored as TEXT and IDs are generated in Worker code with crypto.randomUUID().
- timestamptz/date/time are stored as normalized ISO/text values.
- booleans use INTEGER 0/1 with CHECK constraints.
- jsonb is stored as TEXT with json_valid() checks.
- bytea is stored as BLOB.
- Supabase auth.users foreign keys are redirected to nail_2nya_admin_users for the transition period.
- PostgreSQL GiST/tstzrange appointment exclusion is replaced by D1 overlap-guard triggers.
- PostgreSQL audit/realtime/update triggers are intentionally not copied here; their behavior moves to Worker service logic in the backend migration phase.
- nail_2nya_public_media_chunks_v4 is retained for compatibility during migration even though target media storage is R2.

Validated locally against SQLite: 21 Donya tables, 11 explicit indexes, and 2 overlap-protection triggers create successfully.
