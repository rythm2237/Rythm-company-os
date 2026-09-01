import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function filesBelow(path: string): string[] {
  const absolute = join(ROOT, path);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((entry) => {
    const child = join(absolute, entry);
    if (statSync(child).isDirectory()) return filesBelow(relative(ROOT, child));
    return [relative(ROOT, child)];
  });
}

const requiredPublicRoutes = [
  "/",
  "/about",
  "/ai-workforce",
  "/ai-agents-for-business",
  "/how-it-works",
  "/product",
  "/product/ai-agents",
  "/product/integrations",
  "/product-architecture",
  "/use-cases",
  "/use-cases/startups",
  "/use-cases/agencies",
  "/use-cases/software-companies",
  "/faq",
  "/docs",
  "/glossary",
  "/compare",
  "/compare/lindy",
  "/compare/relevance-ai",
  "/compare/crewai",
  "/compare/microsoft-copilot-studio",
  "/pricing",
  "/enterprise",
  "/trust",
  "/security",
] as const;

const siteSource = read("lib/seo/site.ts");
const routePaths = [...siteSource.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(routePaths).size, routePaths.length, "PUBLIC_ROUTES contains a duplicate path");
for (const path of requiredPublicRoutes) {
  assert(routePaths.includes(path), `PUBLIC_ROUTES is missing ${path}`);
}

const publicPageFiles = filesBelow("app/(public)").filter((file) => file.endsWith("/page.tsx"));
for (const file of publicPageFiles) {
  const source = read(file);
  const metadataPath = source.match(/createPublicMetadata\("([^"]+)"\)/)?.[1];
  assert(metadataPath, `${file} does not use createPublicMetadata`);
  assert(routePaths.includes(metadataPath), `${file} metadata path ${metadataPath} is absent from PUBLIC_ROUTES`);
}

const runtimeFiles = ["app", "components", "lib", "public"]
  .flatMap(filesBelow)
  .filter((file) => /\.(?:ts|tsx|js|jsx|json|txt)$/.test(file));
const legacyReferences = runtimeFiles.filter((file) => read(file).includes("https://company.rythm-os.com"));
assert.deepEqual(legacyReferences, [], `Legacy canonical host remains in runtime/public files: ${legacyReferences.join(", ")}`);

assert(siteSource.includes('SITE_ORIGIN = "https://rythm-os.com"'), "Canonical SITE_ORIGIN is not the apex domain");
assert(siteSource.includes('title: "Governed AI Workforce Platform | RYTHM Company OS"'), "Homepage category title is missing");
assert(siteSource.includes('"@type": "Organization"'), "Organization schema is missing");
assert(siteSource.includes('"@type": "WebSite"'), "WebSite schema is missing");
assert(siteSource.includes('applicationSubCategory: "Governed AI workforce platform"'), "WebApplication category signal is missing");

const robotsSource = read("app/robots.ts");
for (const crawler of ["Googlebot", "Bingbot", "OAI-SearchBot", "PerplexityBot", "Claude-SearchBot", "GPTBot", "ClaudeBot"]) {
  assert(robotsSource.includes(`"${crawler}"`), `robots policy is missing ${crawler}`);
}
assert(robotsSource.includes("/api/"), "robots policy no longer excludes API routes");
for (const privatePath of ["/agents/", "/integrations/", "/company/", "/meetings/", "/studio/", "/login", "/signup"]) {
  assert(robotsSource.includes(`"${privatePath}"`), `robots policy no longer excludes ${privatePath}`);
}

const sitemapSource = read("app/sitemap.ts");
assert(sitemapSource.includes("PUBLIC_ROUTES"), "sitemap no longer derives from the canonical public-route registry");

const redirectSource = read("next.config.ts");
assert(redirectSource.includes('value: "company.rythm-os.com"'), "Legacy company-host redirect is missing");
assert(redirectSource.includes('value: "www.rythm-os.com"'), "WWW-host redirect is missing");
assert(redirectSource.includes('destination: "https://rythm-os.com/:path*"'), "Redirect destination is not canonical");
assert(redirectSource.includes("permanent: true"), "Canonical host redirect is not permanent");

const organizationSchema = read("components/brand/OrganizationStructuredData.tsx");
assert(organizationSchema.includes("ORGANIZATION_GRAPH"), "Homepage Organization schema component is not connected");

const footerSource = read("app/(public)/_components/PublicShell.tsx");
for (const path of ["/ai-workforce", "/ai-agents-for-business", "/how-it-works", "/use-cases", "/docs", "/compare", "/faq", "/glossary"]) {
  assert(footerSource.includes(`"${path}"`), `Footer does not link to ${path}`);
}

const llmsSource = read("public/llms.txt");
for (const path of ["/ai-workforce", "/ai-agents-for-business", "/how-it-works", "/product/integrations", "/compare", "/faq", "/docs"]) {
  assert(llmsSource.includes(`https://rythm-os.com${path}`), `llms.txt is missing ${path}`);
}

assert(existsSync(join(ROOT, "app/(app)/agents/page.tsx")), "Authenticated Agents workspace is missing");
assert(existsSync(join(ROOT, "app/(app)/integrations/page.tsx")), "Authenticated Integrations workspace is missing");
assert(existsSync(join(ROOT, "app/(public)/product/ai-agents/page.tsx")), "Public AI Agent page is missing");
assert(existsSync(join(ROOT, "app/(public)/product/integrations/page.tsx")), "Public Integrations page is missing");

const comparisonSource = read("lib/seo/comparisons.ts");
for (const host of ["lindy.ai", "relevanceai.com", "crewai.com", "microsoft.com"]) {
  assert(comparisonSource.includes(host), `Comparison sources are missing official ${host} links`);
}

const referralObserver = read("app/(public)/_components/PublicReferralObserver.tsx");
for (const host of ["chatgpt.com", "perplexity.ai", "gemini.google.com", "copilot.microsoft.com", "claude.ai"]) {
  assert(referralObserver.includes(host), `AI referral observer is missing ${host}`);
}

console.log(`SEO/GEO/AEO foundation validation passed for ${requiredPublicRoutes.length} critical public routes.`);
