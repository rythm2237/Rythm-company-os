const FORBIDDEN = new Set([
  "insert", "update", "delete", "merge", "create", "alter", "drop", "truncate",
  "grant", "revoke", "copy", "call", "do", "vacuum", "analyze", "refresh",
  "cluster", "reindex", "begin", "start", "commit", "rollback", "savepoint",
  "release", "set", "reset", "lock", "listen", "unlisten", "notify", "discard",
  "prepare", "execute", "deallocate", "security", "checkpoint",
]);

const SAFE_FUNCTIONS = new Set([
  "abs", "array_agg", "array_length", "avg", "btrim", "ceil", "ceiling", "char_length",
  "coalesce", "concat", "concat_ws", "count", "current_date", "current_timestamp", "date_part",
  "date_trunc", "extract", "floor", "greatest", "json_agg", "json_build_array",
  "json_build_object", "jsonb_agg", "jsonb_array_length", "jsonb_build_array",
  "jsonb_build_object", "least", "left", "length", "lower", "ltrim", "max", "min",
  "now", "nullif", "position", "regexp_replace", "replace", "right", "round", "rtrim",
  "split_part", "string_agg", "substring", "sum", "to_char", "to_date", "to_json",
  "to_jsonb", "trim", "upper",
]);

type Token = { kind: "word" | "symbol"; value: string };

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < sql.length) {
    const char = sql[index];
    if (/\s/.test(char)) { index += 1; continue; }
    if (char === "-" && sql[index + 1] === "-") {
      index += 2;
      while (index < sql.length && sql[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && sql[index + 1] === "*") {
      const end = sql.indexOf("*/", index + 2);
      if (end < 0) throw new Error("Unterminated SQL comment.");
      index = end + 2;
      continue;
    }
    if (char === "'" || char === '"') {
      const quote = char;
      index += 1;
      let closed = false;
      while (index < sql.length) {
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) { index += 2; continue; }
          index += 1; closed = true; break;
        }
        if (sql[index] === "\\" && quote === "'") index += 2;
        else index += 1;
      }
      if (!closed) throw new Error("Unterminated SQL string or identifier.");
      tokens.push({ kind: "symbol", value: quote === "'" ? "<string>" : "<identifier>" });
      continue;
    }
    if (char === "$") {
      const tag = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (tag) {
        const end = sql.indexOf(tag, index + tag.length);
        if (end < 0) throw new Error("Unterminated dollar-quoted SQL string.");
        index = end + tag.length;
        tokens.push({ kind: "symbol", value: "<string>" });
        continue;
      }
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = sql.slice(index).match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0] ?? char;
      tokens.push({ kind: "word", value: match.toLowerCase() });
      index += match.length;
      continue;
    }
    tokens.push({ kind: "symbol", value: char });
    index += 1;
  }
  return tokens;
}

function withoutTrailingSemicolon(tokens: Token[]) {
  const semicolons = tokens.map((token, index) => token.value === ";" ? index : -1).filter((index) => index >= 0);
  if (!semicolons.length) return tokens;
  if (semicolons.length !== 1 || semicolons[0] !== tokens.length - 1) throw new Error("sql.read accepts exactly one SQL statement.");
  return tokens.slice(0, -1);
}

export function validateReadOnlySql(input: string): string {
  const sql = input.trim();
  if (!sql || sql.length > 100_000) throw new Error("sql.read requires one bounded SQL query.");
  const tokens = withoutTrailingSemicolon(tokenize(sql));
  if (!tokens.length || tokens[0].kind !== "word" || !["select", "with"].includes(tokens[0].value)) {
    throw new Error("sql.read only accepts SELECT queries.");
  }
  for (const token of tokens) {
    if (token.kind === "word" && FORBIDDEN.has(token.value)) throw new Error(`sql.read rejected forbidden SQL operation: ${token.value}.`);
  }
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (token.value === "<identifier>" && next.value === "(") throw new Error("sql.read rejected a quoted function call.");
    if (token.kind !== "word" || next.value !== "(") continue;
    const previous = tokens[index - 1]?.value;
    if (["as", "in", "exists", "over", "filter", "select", "from", "join", "on", "where", "when"].includes(token.value)) continue;
    if (previous === "." || !SAFE_FUNCTIONS.has(token.value)) throw new Error(`sql.read rejected non-allowlisted function call: ${token.value}.`);
  }
  const selectInto = tokens.some((token, index) => token.value === "select" && tokens.slice(index + 1).some((candidate) => candidate.value === "into"));
  if (selectInto) throw new Error("sql.read does not permit SELECT INTO.");
  return sql.replace(/;\s*$/, "");
}

export function wrapReadOnlySql(input: string) {
  const sql = validateReadOnlySql(input);
  return `begin transaction read only; set local statement_timeout = '15000ms'; set local idle_in_transaction_session_timeout = '20000ms'; ${sql}; commit;`;
}
