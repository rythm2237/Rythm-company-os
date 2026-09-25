import { readFile } from "node:fs/promises";

const SITE_ORIGIN = "https://rythm-os.com";
const HOST = "rythm-os.com";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const INDEXNOW_KEY = "76c6af80bdc92c74e57a393b32473a81";
const KEY_LOCATION = `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`;
const SITEMAP_URL = `${SITE_ORIGIN}/sitemap.xml`;
const MAX_BATCH_SIZE = 10_000;

function canonicalize(rawUrl) {
  const parsed = new URL(rawUrl);
  if (parsed.origin !== SITE_ORIGIN) {
    throw new Error(`IndexNow refused non-canonical origin: ${rawUrl}`);
  }
  parsed.hash = "";
  return parsed.toString();
}

function extractSitemapUrls(xml, { allowEmpty = false } = {}) {
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
  const urls = [...new Set(matches.map(canonicalize))];
  if (!allowEmpty && !urls.length) throw new Error("No canonical URLs were found in the production sitemap.");
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
    headers: { "user-agent": "RYTHM-IndexNow/2.0" },
    cache: "no-store",
  });
  const body = (await response.text()).trim();
  if (body !== INDEXNOW_KEY) {
    throw new Error(`IndexNow key verification failed at ${KEY_LOCATION}.`);
  }
}

async function readPreviousSitemapUrls() {
  const path = process.env.INDEXNOW_PREVIOUS_SITEMAP_FILE?.trim();
  if (!path) return [];

  try {
    return extractSitemapUrls(await readFile(path, "utf8"), { allowEmpty: true });
  } catch (error) {
    console.warn(`Previous sitemap could not be read; deletion detection will be skipped: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

async function submitBatch(urlList) {
  const payload = {
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: KEY_LOCATION,
    urlList,
  };

  if (process.env.INDEXNOW_DRY_RUN === "1") {
    console.log(JSON.stringify({ dryRun: true, endpoint: INDEXNOW_ENDPOINT, ...payload }, null, 2));
    return { status: 0, accepted: true };
  }

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "user-agent": "RYTHM-IndexNow/2.0",
    },
    body: JSON.stringify(payload),
  });

  const responseText = (await response.text()).trim();
  const accepted = response.status === 200 || response.status === 202;
  if (!accepted) {
    throw new Error(`IndexNow submission failed with ${response.status}: ${responseText || "no response body"}`);
  }

  if (responseText) console.log(responseText);
  return { status: response.status, accepted };
}

async function main() {
  await verifyKeyLocation();

  const previousUrls = await readPreviousSitemapUrls();
  const sitemapResponse = await requireSuccessfulFetch(SITEMAP_URL, {
    headers: {
      "user-agent": "RYTHM-IndexNow/2.0",
      "cache-control": "no-cache",
    },
    cache: "no-store",
  });
  const currentUrls = extractSitemapUrls(await sitemapResponse.text());
  const currentSet = new Set(currentUrls);
  const removedUrls = previousUrls.filter((url) => !currentSet.has(url));
  const urls = [...new Set([...currentUrls, ...removedUrls])];

  console.log(
    `IndexNow production release: ${currentUrls.length} current canonical URLs, ${removedUrls.length} removed URLs, ${urls.length} total notifications.`,
  );

  const statuses = [];
  for (let offset = 0; offset < urls.length; offset += MAX_BATCH_SIZE) {
    const batch = urls.slice(offset, offset + MAX_BATCH_SIZE);
    const result = await submitBatch(batch);
    statuses.push(result.status);
    console.log(`IndexNow accepted batch ${Math.floor(offset / MAX_BATCH_SIZE) + 1} (${batch.length} URLs)${result.status ? ` with HTTP ${result.status}` : " in dry-run mode"}.`);
  }

  console.log(
    JSON.stringify({
      accepted: true,
      current: currentUrls.length,
      removed: removedUrls.length,
      submitted: urls.length,
      statuses,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
