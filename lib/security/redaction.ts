const SENSITIVE_KEY = /(?:^|[_-])(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|passwd|credential|private[_-]?key|service[_-]?role|secret)(?:$|[_-])/i;

const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\b/gi,
  /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{12,}\b/gi,
  /\bya29\.[A-Za-z0-9._~-]+\b/gi,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|authorization|credential|service[_-]?role)\s*[=:]\s*)[^\s,;]+/gi,
];

export function redactSecretText(value: unknown, maxLength = 1000): string {
  let text = value instanceof Error ? value.message : String(value ?? "");
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, (_match, prefix) => `${typeof prefix === "string" ? prefix : ""}[REDACTED]`);
  return text.replace(/[\r\n\t]+/g, " ").slice(0, maxLength);
}

export function redactSensitiveValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof value === "string") return redactSecretText(value, 2000);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactSensitiveValue(item, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redactSecretText(value.message) };
  if (typeof value !== "object") return redactSecretText(value);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 100)
      .map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitiveValue(item, depth + 1)]),
  );
}

export function safeErrorMetadata(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: redactSecretText(error.message) };
  return { name: "Error", message: redactSecretText(error) };
}
