# W01 — live production schema metadata verification (2026-10-25)

Scope: **read-only metadata SQL** via connected Supabase on project `dezbacyuvsdrlpmmpjht`. No database password, production DDL/DML, customer row export, live provider invocation, or purchase.

## Confirmed
- `public` base/partitioned tables: **214**.
- Tables with RLS enabled: **214/214**.
- Rows of `pg_policies` in `public`: **338**, across **181** tables.
- Functions in `public`: **234**.
- `information_schema.columns` in `public`: **3,232**.
- The remaining **33** RLS-enabled tables have **no direct `pg_policies` entries**. **32/33** have no SELECT or INSERT privilege for either `anon` or `authenticated` (fail-closed against these roles).
- `billing_webhook_events` is the exception: `anon` and `authenticated` both hold `SELECT` and `INSERT` table privileges **but RLS is enabled and there are no policies**. Resulting row access is still denied by PostgreSQL RLS for these non-bypass roles. The grants should be reviewed for defense in depth, but this is **not proven unauthorized access**.
- Prior local GitHub CI confirmed real SQL replay is incomplete due to missing tracked table `public.nail_2nya_appointments` and other historical migrations with data dependencies. No source-independent complete schema replay demonstrated.
- Two-tenant synthetic core RLS smoke passed: [CI run](https://github.com/rythm2237/Rythm-company-os/actions/runs/40189400037).

## Read-only reproduction SQL

```sql
WITH t AS (
 SELECT c.relname,c.relrowsecurity
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
)
SELECT (SELECT count(*) FROM t) AS tables,
       (SELECT count(*) FROM t WHERE relrowsecurity) AS rls_enabled,
       (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS policies,
       (SELECT count(DISTINCT tablename) FROM pg_policies WHERE schemaname='public') AS tables_with_policy,
       (SELECT count(*) FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='public') AS functions,
       (SELECT count(*) FROM information_schema.columns WHERE table_schema='public') AS columns;
```

```sql
SELECT c.relname,has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
 has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
 has_table_privilege('anon',c.oid,'INSERT') AS anon_insert,
 has_table_privilege('authenticated',c.oid,'INSERT') AS authenticated_insert
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity
AND NOT EXISTS (
 SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname
) ORDER BY c.relname;
```

## Remaining W01 gate

**AC1 PARTIAL / AC2 PARTIAL / AC3 PASS**. These SQL catalog reads establish inventory, not a reproducible `pg_dump --schema-only` equivalent. They do not certify the complete function definitions, triggers, extension DDL, grants, policies and clean local rebuild. A reviewed schema-only export or a separately validated exhaustive DDL reconstruction is still needed before W01 is marked PASS. Do not reset live DB password or merge into main for this test.
