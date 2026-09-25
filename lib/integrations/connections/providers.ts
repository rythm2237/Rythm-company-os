export * from "../adapters/customer-connections";
import { getTokenConnectionAdapter as getBaseTokenConnectionAdapter } from "../adapters/customer-connections";
import { semrushAdapter } from "../adapters/semrush";

export function getTokenConnectionAdapter(providerKey: string) {
  if (providerKey === "semrush") return semrushAdapter;
  return getBaseTokenConnectionAdapter(providerKey);
}
