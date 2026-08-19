import "server-only";
import { normalizeRole, type NormalizedRole } from "@/lib/trusted-agent-knowledge";

function clean(value: string) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

const fullStackTitle = /\bfull[-\s]?stack\s+(web\s+)?(developer|engineer)\b/i;
const frontendTitle = /\bfront[-\s]?end\s+(web\s+)?(developer|engineer)\b/i;
const backendTitle = /\bback[-\s]?end\s+(web\s+)?(developer|engineer)\b/i;
const webTitle = /\bweb\s+(developer|engineer)\b/i;
const softwareWebTitle = /\bsoftware\s+(developer|engineer)\b/i;
const webExpertiseSignal = /\b(next\.?js|react|typescript|javascript|html5?|css3?|web\s+app(?:lication)?s?|rest\s+apis?|frontend|front[-\s]?end|backend|back[-\s]?end|full[-\s]?stack)\b/i;

function webRole(rawRoleTitle: string, canonicalRole: string): NormalizedRole {
  return {
    rawRoleTitle,
    canonicalRole,
    roleFamily: "technology",
    specializations: ["web_development"],
    deterministic: true,
  };
}

/**
 * Resolve an Agent's professional role from BOTH the selected position and the
 * user-supplied core expertise. Explicit position titles take precedence;
 * expertise is used as a secondary discriminator for ambiguous developer roles.
 */
export function normalizeAgentRoleInput(rawRoleTitle: string, expertise = ""): NormalizedRole {
  const title = clean(rawRoleTitle);
  const specialty = clean(expertise);

  if (fullStackTitle.test(title)) return webRole(title, "Full-Stack Web Developer");
  if (frontendTitle.test(title)) return webRole(title, "Front-End Web Developer");
  if (backendTitle.test(title)) return webRole(title, "Back-End Web Developer");
  if (webTitle.test(title)) return webRole(title, "Web Developer");

  // A generic software/developer title is treated as web engineering only when
  // the expertise field independently supplies strong web-stack evidence.
  if ((softwareWebTitle.test(title) || /\bdeveloper\b/i.test(title)) && webExpertiseSignal.test(specialty)) {
    return webRole(title, "Full-Stack Web Developer");
  }

  // Preserve the existing deterministic catalogue for all other known roles.
  const titleResolved = normalizeRole(title);
  if (titleResolved.roleFamily !== "general" || titleResolved.specializations.length > 0) return titleResolved;

  // Expertise is a secondary signal, never allowed to override an explicit
  // recognized position. This keeps UI/UX/Legal/etc. titles stable while still
  // making the Core expertise field operational for ambiguous roles.
  if (webExpertiseSignal.test(specialty) && /\b(software|web|application|app|developer|engineer)\b/i.test(`${title} ${specialty}`)) {
    return webRole(title, title || "Full-Stack Web Developer");
  }

  return titleResolved;
}
