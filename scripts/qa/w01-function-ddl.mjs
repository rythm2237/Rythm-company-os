// pg_get_functiondef returns a CREATE statement without its SQL terminator.
// Keep the definition intact and terminate each statement before concatenation.
export function joinFunctionDefinitions(definitions) {
  return definitions.map(ddl => {
    if (typeof ddl !== 'string' || !/^CREATE OR REPLACE FUNCTION\s/.test(ddl)) throw new Error('Expected a pg_get_functiondef CREATE FUNCTION statement');
    const statement = ddl.trimEnd();
    return statement + (statement.endsWith(';') ? '' : ';') + '\n';
  }).join('\n');
}
