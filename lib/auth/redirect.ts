/** Authentication destinations must remain relative to this application. */
export function safeAuthPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/home";
  // Reject encoded path separators/control characters, including nested encodings.
  const pathname = value.split(/[?#]/, 1)[0];
  let decoded = pathname;
  try {
    for (let i = 0; i < 4; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch { return "/home"; }
  if (decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded) || /%(?:2f|5c|25)/i.test(decoded)) return "/home";
  const base = "https://auth.invalid";
  try {
    const parsed = new URL(value, base);
    if (parsed.origin !== base || parsed.pathname.startsWith("//")) return "/home";
    return parsed.pathname + parsed.search + parsed.hash;
  } catch { return "/home"; }
}

/** Explicit, server-side environment configuration; never trust forwarded host headers. */
export function authCallbackOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.AUTH_SITE_ORIGIN;
  const raw = configured || (env.VERCEL_ENV === "preview" && env.VERCEL_URL
    ? `https://${env.VERCEL_URL}` : env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development" || env.NODE_ENV === "development"
    ? "http://localhost:3000" : "https://rythm-os.com");
  const url = new URL(raw);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Invalid authentication callback origin.");
  }
  return url.origin;
}
