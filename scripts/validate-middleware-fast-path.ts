import fs from "node:fs";

const source = fs.readFileSync("middleware.ts", "utf8");

const required = [
  'const pageAuthFastPath = pathname.startsWith("/studio/") || pathname === "/studio";',
  'if (pageAuthFastPath && !meetingApiLimit) return response;',
];

for (const fragment of required) {
  if (!source.includes(fragment)) {
    throw new Error(`Middleware fast-path contract missing: ${fragment}`);
  }
}

const fastPathIndex = source.indexOf('if (pageAuthFastPath && !meetingApiLimit) return response;');
const getUserIndex = source.indexOf('await supabase.auth.getUser()');
if (fastPathIndex < 0 || getUserIndex < 0 || fastPathIndex > getUserIndex) {
  throw new Error("Studio middleware fast path must return before Supabase auth network I/O.");
}

console.log("Middleware fast-path validation passed.");
