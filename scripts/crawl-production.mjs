const ORIGIN = process.env.SEO_CRAWL_ORIGIN || "https://rythm-os.com";
const SITEMAP_URL = `${ORIGIN}/sitemap.xml`;

function absolute(value, base) {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

function normalizePageUrl(url) {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.search = "";
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

function extractSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1].trim());
}

function extractCanonical(html, base) {
  const match = html.match(/<link\b[^>]*\brel=["'][^"']*canonical[^"']*["'][^>]*>/i)
    || html.match(/<link\b[^>]*\bhref=["'][^"']+["'][^>]*\brel=["'][^"']*canonical[^"']*["'][^>]*>/i);
  if (!match) return null;
  const href = match[0].match(/\bhref=["']([^"']+)["']/i)?.[1];
  return href ? absolute(href, base)?.toString() ?? null : null;
}

function hasNoindex(html) {
  return /<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["'][^"']*noindex/i.test(html)
    || /<meta\b[^>]*\bcontent=["'][^"']*noindex[^"']*["'][^>]*\bname=["']robots["']/i.test(html);
}

function extractInternalLinks(html, pageUrl) {
  const links = new Set();
  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    const href = match[1].trim();
    if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
    const resolved = absolute(href, pageUrl);
    if (!resolved || resolved.origin !== ORIGIN) continue;
    if (/^\/(api|login|signup|forgot-password|reset-password)(\/|$)/.test(resolved.pathname)) continue;
    links.add(normalizePageUrl(resolved));
  }
  return links;
}

async function fetchManual(url) {
  return fetch(url, {
    redirect: "manual",
    headers: { "user-agent": "RYTHM-Production-SEO-Crawl/1.0" },
  });
}

const failures = [];
const notices = [];

const sitemapResponse = await fetchManual(SITEMAP_URL);
if (sitemapResponse.status !== 200) {
  throw new Error(`Sitemap returned HTTP ${sitemapResponse.status}`);
}
const sitemapXml = await sitemapResponse.text();
const sitemapUrls = extractSitemapUrls(sitemapXml).map(normalizePageUrl);
const sitemapSet = new Set(sitemapUrls);

if (!sitemapUrls.length) throw new Error("No URLs found in Production sitemap.");
if (sitemapUrls.length !== sitemapSet.size) failures.push("Sitemap contains duplicate canonical URLs.");

const inbound = new Map(sitemapUrls.map((url) => [url, 0]));
const discoveredInternal = new Set();

for (const url of sitemapUrls) {
  const response = await fetchManual(url);
  if (response.status >= 300 && response.status < 400) {
    failures.push(`${url}: unexpected redirect ${response.status} -> ${response.headers.get("location") || "(missing Location)"}`);
    continue;
  }
  if (response.status !== 200) {
    failures.push(`${url}: HTTP ${response.status}`);
    continue;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    failures.push(`${url}: expected text/html, got ${contentType || "unknown content-type"}`);
    continue;
  }

  const html = await response.text();
  const canonical = extractCanonical(html, url);
  if (!canonical) {
    failures.push(`${url}: missing canonical link`);
  } else if (normalizePageUrl(canonical) !== url) {
    failures.push(`${url}: canonical mismatch -> ${canonical}`);
  }

  if (hasNoindex(html)) failures.push(`${url}: unexpected noindex`);

  for (const link of extractInternalLinks(html, url)) {
    discoveredInternal.add(link);
    if (sitemapSet.has(link)) inbound.set(link, (inbound.get(link) || 0) + 1);
  }
}

for (const link of [...discoveredInternal].sort()) {
  if (sitemapSet.has(link)) continue;
  const parsed = new URL(link);
  if (/\.[a-z0-9]{2,5}$/i.test(parsed.pathname)) continue;
  const response = await fetchManual(link);
  if (response.status >= 400) failures.push(`Broken internal link ${link}: HTTP ${response.status}`);
  else if (response.status >= 300 && response.status < 400) {
    notices.push(`Internal link redirects ${link}: ${response.status} -> ${response.headers.get("location") || "(missing Location)"}`);
  } else {
    notices.push(`Linked public URL is not in sitemap: ${link}`);
  }
}

const homepage = normalizePageUrl(`${ORIGIN}/`);
for (const [url, count] of inbound.entries()) {
  if (url !== homepage && count === 0) failures.push(`${url}: orphan sitemap page (no internal links found)`);
}

console.log(`Production crawl origin: ${ORIGIN}`);
console.log(`Sitemap URLs crawled: ${sitemapUrls.length}`);
console.log(`Distinct internal URLs discovered: ${discoveredInternal.size}`);
console.log(`Notices: ${notices.length}`);
for (const notice of notices) console.log(`NOTICE: ${notice}`);
console.log(`Failures: ${failures.length}`);
for (const failure of failures) console.error(`FAIL: ${failure}`);

if (failures.length) process.exit(1);
console.log("Production SEO crawl passed: no broken sitemap pages, canonical defects, unintended noindex directives, or orphan sitemap pages detected.");
