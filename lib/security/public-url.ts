import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

type LookupAddress = { address: string; family: number };
type Lookup = (hostname: string) => Promise<LookupAddress[]>;

export type PublicFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowedHosts?: readonly string[];
  headers?: HeadersInit;
  lookup?: Lookup;
  fetchImpl?: typeof fetch;
};

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home", ".lan", ".localdomain"];

function ipv4Number(address: string) {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
  return parts.reduce((total, part) => (total * 256) + Number(part), 0) >>> 0;
}

function inIpv4Range(value: number, network: number, prefix: number) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (network & mask);
}

function ipv6Bytes(address: string): number[] | null {
  const zoneIndex = address.indexOf("%");
  if (zoneIndex >= 0) return null;
  let normalized = address.toLowerCase();
  const ipv4Tail = normalized.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Tail) {
    const value = ipv4Number(ipv4Tail);
    if (value == null) return null;
    normalized = normalized.slice(0, -ipv4Tail.length) + `${((value >>> 16) & 0xffff).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (fill < 1 && halves.length === 2) return null;
  const parts = [...left, ...Array(fill).fill("0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.flatMap((part) => {
    const value = Number.parseInt(part,16);
    return [(value >>> 8) & 255,value & 255];
  });
}

function inIpv6Range(value: number[], network: number[], prefix: number) {
  const fullBytes=Math.floor(prefix/8);
  const remaining=prefix%8;
  for(let index=0;index<fullBytes;index+=1) if(value[index]!==network[index]) return false;
  if(!remaining) return true;
  const mask=(0xff << (8-remaining)) & 0xff;
  return (value[fullBytes]&mask)===(network[fullBytes]&mask);
}

export function isPublicNetworkAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Number(address);
    if (value == null) return false;
    const blocked: Array<[number, number]> = [
      [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8],
      [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24],
      [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24],
      [0xe0000000, 4], [0xf0000000, 4],
    ];
    return !blocked.some(([network, prefix]) => inIpv4Range(value, network, prefix));
  }
  if (family === 6) {
    const value = ipv6Bytes(address);
    if (value == null) return false;
    const mappedPrefix = ipv6Bytes("::ffff:0:0")!;
    if (inIpv6Range(value, mappedPrefix, 96)) {
      return isPublicNetworkAddress([
        value[12],value[13],value[14],value[15],
      ].join("."));
    }
    const blocked: Array<[number[], number]> = [
      [ipv6Bytes("::")!, 128], [ipv6Bytes("::1")!, 128], [ipv6Bytes("fc00::")!, 7],
      [ipv6Bytes("fe80::")!, 10], [ipv6Bytes("ff00::")!, 8], [ipv6Bytes("2001:db8::")!, 32],
    ];
    return !blocked.some(([network, prefix]) => inIpv6Range(value, network, prefix));
  }
  return false;
}

function normalizeHost(hostname: string) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

async function defaultLookup(hostname: string) {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

export async function validatePublicHttpUrl(input: string | URL, options: Pick<PublicFetchOptions, "allowedHosts" | "lookup"> = {}) {
  const url = input instanceof URL ? new URL(input) : new URL(input);
  if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("Only http and https URLs are allowed.");
  if (url.username || url.password) throw new Error("URLs with embedded credentials are not allowed.");
  if ((url.protocol === "http:" && url.port && url.port !== "80") || (url.protocol === "https:" && url.port && url.port !== "443")) {
    throw new Error("Non-standard URL ports are not allowed.");
  }
  const host = normalizeHost(url.hostname);
  const literalFamily = isIP(host);
  if (!host || host === "localhost" || (!literalFamily && !host.includes(".")) || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new Error("Local or internal hostnames are not allowed.");
  }
  if (options.allowedHosts?.length) {
    const allowed = options.allowedHosts.map(normalizeHost);
    if (!allowed.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))) throw new Error("URL host is not allowlisted.");
  }
  const addresses = literalFamily ? [{ address: host, family: literalFamily }] : await (options.lookup ?? defaultLookup)(host);
  if (!addresses.length || addresses.some((item) => !isPublicNetworkAddress(item.address))) {
    throw new Error("URL resolves to a private, local, reserved or otherwise unsafe network address.");
  }
  url.hostname = literalFamily === 6 ? `[${host}]` : host;
  return url;
}

async function readLimited(response: Response, maxBytes: number) {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > maxBytes) throw new Error("Remote response exceeds the allowed size.");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Remote response exceeds the allowed size.");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

export async function fetchPublicResource(input: string | URL, options: PublicFetchOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRedirects = options.maxRedirects ?? 4;
  const maxBytes = options.maxBytes ?? 1_000_000;
  let current = input instanceof URL ? new URL(input) : new URL(input);
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    current = await validatePublicHttpUrl(current, options);
    const response = await fetchImpl(current, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      headers: options.headers,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Remote redirect did not provide a destination.");
      if (redirects === maxRedirects) throw new Error("Remote URL exceeded the redirect limit.");
      current = new URL(location, current);
      continue;
    }
    const bytes = await readLimited(response, maxBytes);
    return { response, bytes, finalUrl: current };
  }
  throw new Error("Remote URL exceeded the redirect limit.");
}
