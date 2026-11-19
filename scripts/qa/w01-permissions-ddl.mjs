// Raw pg_dump clears search_path. Catalog-exported GRANT signatures may use
// visible public types, so resolve them in a catalog-first, transaction-local
// path while applying privileges. The final attestation sets its own empty path.
export function preparePermissionRestoreSql(ddl) {
  return 'SET LOCAL search_path = pg_catalog, public;\n' + ddl;
}
