export * from "../adapters/customer-connections";
import { getTokenConnectionAdapter as getBaseTokenConnectionAdapter } from "../adapters/customer-connections";
import { semrushAdapter } from "../adapters/semrush";
import { bingWebmasterAdapter } from "../adapters/bing-webmaster";
import { youtubeAdapter } from "../adapters/youtube";

export function getTokenConnectionAdapter(providerKey: string) {
  if (providerKey === "semrush") return semrushAdapter;
  if (providerKey === "bing_webmaster") return bingWebmasterAdapter;
  if (providerKey === "youtube") return youtubeAdapter;
  return getBaseTokenConnectionAdapter(providerKey);
}
