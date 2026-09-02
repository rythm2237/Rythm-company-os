const SITE_ORIGIN = "https://rythm-os.com";
const HOST = "rythm-os.com";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const INDEXNOW_KEY = "54515104f352a0709547a2e2e5df9e3e3c261a709bfb6a6346b7f5c3903bcf1d";
const KEY_LOCATION = `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`;
const SITEMAP_URL = `${SITE_ORIGIN}/sitemap.xml`;

function canonicalize(rawUrl) {
  const parsed = new URL(rawUrl);
  if (parsed.origin !== SITE_ORIGIN) {
    throw new Error(`IndexNow refused non-canonical origin: ${rawUrl}`);
  }
  parsed.hash = "";
  return parsed.toString();
}

function extractSitemapUrls(xml) {
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
  const urls = [...new Set(matches.map(canonicalize))];
  if (!urls.length) throw new Error("No canonical URLs were found in the production sitemap.");
  if (urls.length > 10_000) throw new Error(`IndexNow batch exceeds 10,000 URLs: ${urls.length}`);
  return urls;
}

async function requireSuccessfulFetch(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1_000);
    throw new Error(`${url} returned ${response.status}: ${detail}`);
  }
  return response;
}

async function verifyKeyLocation() {
  const response = await requireSuccessfulFetch(KEY_LOCATION, {
    headers: { "user-agent": "RYTHM-IndexNow/1.0" },
    cache: "no-store",
  });
  const body = (await response.text()).trim();
  if (body !== INDEXNOW_KEY) {
    throw new Error(`IndexNow key verification failed at ${KEY_LOCATION}.`);
  }
}

async function main() {
  await verifyKeyLocation();

  const sitemapResponse = await requireSuccessfulFetch(SITEMAP_URL, {
    headers: { "user-agent": "RYTHM-IndexNow/1.0" },
    cache: "no-store",
  });
  const urls = extractSitemapUrls(await sitemapResponse.text());

  const payload = {
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: KEY_LOCATION,
    urlList: urls,
  };

  if (process.env.INDEXNOW_DRY_RUN === "1") {
    console.log(JSON.stringify({ dryRun: true, endpoint: INDEXNOW_ENDPOINT, ...payload }, null, 2));
    return;
  }

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "user-agent": "RYTHM-IndexNow/1.0",
    },
    body: JSON.stringify(payload),
  });

  const responseText = (await response.text()).trim();
  if (!response.ok) {
    throw new Error(`IndexNow submission failed with ${response.status}: ${responseText || "no response body"}`);
  }

  console.log(`IndexNow accepted ${urls.length} canonical URLs with HTTP ${response.status}.`);
  if (responseText) console.log(responseText);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
