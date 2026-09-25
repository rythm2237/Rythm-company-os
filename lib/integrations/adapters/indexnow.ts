const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const INDEXNOW_HOST = "rythm-os.com";

export const INDEXNOW_KEY = "76c6af80bdc92c74e57a393b32473a81";
export const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;

export type IndexNowSubmissionResult = {
  ok: boolean;
  status: number;
  accepted: boolean;
  submitted: number;
};

function normalizeIndexNowUrls(urls: string[]) {
  const unique = new Set<string>();

  for (const raw of urls) {
    const value = String(raw ?? "").trim();
    if (!value) continue;

    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== INDEXNOW_HOST) {
      throw new Error(`IndexNow URL must belong to https://${INDEXNOW_HOST}.`);
    }

    url.hash = "";
    unique.add(url.toString());
  }

  const normalized = [...unique];
  if (!normalized.length) throw new Error("At least one IndexNow URL is required.");
  if (normalized.length > 10_000) throw new Error("IndexNow accepts at most 10,000 URLs per submission.");
  return normalized;
}

export async function submitIndexNow(urls: string[]): Promise<IndexNowSubmissionResult> {
  const urlList = normalizeIndexNowUrls(urls);
  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: INDEXNOW_HOST,
      key: INDEXNOW_KEY,
      keyLocation: INDEXNOW_KEY_LOCATION,
      urlList,
    }),
    cache: "no-store",
  });

  return {
    ok: response.ok,
    status: response.status,
    accepted: response.status === 200 || response.status === 202,
    submitted: urlList.length,
  };
}
