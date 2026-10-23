import { createServerClient } from "@supabase/ssr";
import type { SupabaseCookieToSet } from "@/types/supabase-cookie";

export const LOGOUT_TIMEOUT_MS = 3000;
type Cookie = { name: string; value: string };

/** Only this Supabase project's session cookies, including SSR chunks and PKCE state. */
export function isSessionCookie(name: string, key: string) {
  return [key, `${key}-code-verifier`, `${key}-user`].some(
    prefix => name === prefix || (name.startsWith(`${prefix}.`) && /^\d+$/.test(name.slice(prefix.length + 1))),
  );
}

/** Revoke the current session best-effort; local cleanup must never wait indefinitely. */
export async function endSession({ url, key, cookies, fetcher = fetch, timeoutMs = LOGOUT_TIMEOUT_MS }: {
  url: string; key: string; cookies: Cookie[]; fetcher?: typeof fetch; timeoutMs?: number;
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
      client.auth.signOut({ scope: "local" }).then(result => !result.error, () => false),
      deadline,
    ]);
    return { revoked, cookieNames: [...names] };
  } finally {
    sealed = true;
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
