# W01 supplemental replay sources

These 23 inputs recover missing booking-schema dependencies from actual stored
Production migration source, retrieved by read-only catalog queries on 2026-10-28.
They are used ONLY by the zero-credential disposable replay workflow.
The original 218-file migration directory and historical baseline remain unchanged.

21 payloads are exact original UTF-8 source, verified against independently
queried history MD5 values. The file ending live_booking_pwa_admin_schema_only.sql
is an explicitly reviewed schema-only projection: its original DDL, functions,
grants and publication block are retained unchanged, while the credential
bootstrap INSERT and public profile/service/hour/gallery data updates are omitted.
Its projected bytes are independently hashed by a read-only server-side query.
No credential bootstrap value or hash is included in the recovered inputs.

Other original inputs contain the already-public profile/gallery defaults and
storage bucket configuration. Their SQL has been reviewed: no customer/contact/
appointment records, credentials, JWT signing secrets, outbound calls, job creation
or Vault values are included. DML in function bodies defines behavior; those
functions are not invoked by source restoration. Earlier temporary media tables
are created then removed by their actual subsequent historical migrations.

The manifest records 218 original inputs, 23 supplements, their hashes, the
schema-only projection and existing four quarantined live-data seeds. Source
preparation is diagnostic and does not prove exact equivalence to all 203
Production history entries. Physical replay, catalog comparison and behavioral
tests remain independent acceptance gates. Never apply these copies to Production,
rewrite history, insert dummy dependencies, or count an excluded schema change
as verified.

The communication_daily_digest_schema_only input is the exact current canonical function DDL from a read-only pg_get_functiondef query, independently MD5-checked. It restores the missing real function without executing its notification writes or recreating any scheduled job. It is a declared catalog-derived projection, not a recovered full historical migration.
