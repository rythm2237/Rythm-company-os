import { redactSecretText } from "@/lib/security/redaction";

const REQUIRED_FIELDS: Record<string, string[]> = {
  "github.repository:repo.read": ["owner", "repo"],
  "github.repository:branch.create": ["owner", "repo", "branch", "fromSha"],
  "github.repository:code.write": [
    "owner",
    "repo",
    "path",
    "content",
    "message",
    "branch",
  ],
  "github.repository:pull_request.create": [
    "owner",
    "repo",
    "title",
    "head",
    "base",
  ],
  "github.repository:pull_request.merge": ["owner", "repo", "pullNumber"],
  "vercel.deployment:preview.deploy": ["name"],
  "vercel.deployment:production.deploy": ["name"],
  "supabase.database:sql.read": ["sql"],
  "supabase.database:migration.apply": ["sql"],
  "cloudflare.dns:dns.read": ["zoneId"],
  "cloudflare.dns:dns.write": ["zoneId", "type", "name", "content"],
  "google_workspace.calendar:calendar.write": ["event"],
  "google_workspace.email:email.send": ["raw"],
  "microsoft_365.calendar:calendar.write": ["event"],
  "microsoft_365.email:email.send": ["message"],
  "resend.email:email.send": ["from", "to", "subject", "text"],
};

export type InputValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export function validateExecutionInput(
  tool: string,
  operation: string,
  input: Record<string, unknown>,
): InputValidationResult {
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return { valid: false, error: "Execution input must be serializable." };
  }
  if (Buffer.byteLength(serialized, "utf8") > 250_000)
    return {
      valid: false,
      error: "Execution input exceeds the maximum governed payload size.",
    };
  for (const field of REQUIRED_FIELDS[`${tool}:${operation}`] ?? []) {
    if (input[field] == null || input[field] === "")
      return {
        valid: false,
        error: `Missing required execution input: ${field}.`,
      };
  }
  if (
    tool === "stripe.billing" &&
    operation === "refund.create" &&
    !input.paymentIntent &&
    !input.charge
  ) {
    return {
      valid: false,
      error: "A paymentIntent or charge reference is required.",
    };
  }
  if (tool === "resend.email" && operation === "email.send") {
    const recipients = Array.isArray(input.to) ? input.to : [input.to];
    if (
      !recipients.length ||
      recipients.some(
        (value) =>
          typeof value !== "string" ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      )
    ) {
      return {
        valid: false,
        error: "Every email recipient must be a valid address.",
      };
    }
  }
  if (
    Object.keys(input).some((key) =>
      /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential)/i.test(
        key,
      ),
    )
  ) {
    return {
      valid: false,
      error: "Credentials are prohibited in execution input.",
    };
  }
  return { valid: true };
}

export function safeInputValidationError(result: InputValidationResult) {
  return result.valid ? null : redactSecretText(result.error);
}
