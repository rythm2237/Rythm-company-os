import { createServerClient } from "@supabase/ssr";
import type { SupabaseCookieToSet } from "@/types/supabase-cookie";

export const LOGOUT_TIMEOUT_MS = 3000;
type Cookie = { name: string; value: string };

/** Only this Supabase project's session cookies, including SSR chunks and PKCE state. */
export function isSessionCookie(name: string, key: string) {
  const isChunk = (prefix: string) => name === prefix || (name.startsWith(`${prefix}.`) && /^\d+$/.test(name.slice(prefix.length + 1)));
  // Recent Supabase Auth versions store concurrent PKCE flow verifiers and
  // their flow index separately from the session. Clear only this project's
  // exact Auth namespace, including chunked flow cookies.
  if ([key, `${key}-code-verifier`, `${key}-user`, `${key}-flows-code-verifier`].some(isChunk)) return true;
  const flowPrefix = `${key}-flow-`;
  return name.startsWith(flowPrefix) && /^[a-f0-9-]{16,64}-code-verifier(?:\.\d+)?$/i.test(name.slice(flowPrefix.length));
}

/** Revoke the current session best-effort; local cleanup must never wait indefinitely. */
export async function endSession({ url, key, cookies, fetcher = fetch, timeoutMs = LOGOUT_TIMEOUT_MS, scope = "local" }: {
  url: string; key: string; cookies: Cookie[]; fetcher?: typeof fetch; timeoutMs?: number; scope?: "local" | "global";
}) {
  const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const names = new Set(cookies.filter(c => isSessionCookie(c.name, storageKey)).map(c => c.name));
  names.add(storageKey);
  const controller = new AbortController();
  let sealed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // An auth-only, non-retryable failure prevents refresh retry loops during logout.
  const unavailable = () => Response.json({ message: "Sign out service unavailable" }, { status: 400 });
  const boundedFetch: typeof fetch = async (input, init) => {
    if (controller.signal.aborted) return unavailable();
    try {
      const response = await fetcher(input, { ...init, signal: controller.signal, cache: "no-store" });
      return response.status >= 500 ? unavailable() : response;
    } catch { return unavailable(); }
  };
  try {
    const client = createServerClient(url, key, {
      global: { fetch: boundedFetch },
      cookies: {
        getAll: () => cookies,
        setAll: (changes: SupabaseCookieToSet[]) => {
          if (!sealed) for (const c of changes) if (isSessionCookie(c.name, storageKey)) names.add(c.name);
        },
      },
    });
    const deadline = new Promise<false>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(false); }, timeoutMs);
    });
    const revoked = await Promise.race([
      client.auth.signOut({ scope }).then(result => !result.error, () => false),
      deadline,
    ]);
    return { revoked, cookieNames: [...names] };
  } finally {
    sealed = true;
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
