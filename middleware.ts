import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseCookieToSet } from "@/types/supabase-cookie";

const INTERNAL_ERROR_PATTERNS = [
  /duplicate key/i,
  /violates? .*constraint/i,
  /row-level security/i,
  /permission denied/i,
  /relation .* does not exist/i,
  /column .* does not exist/i,
  /invalid input syntax/i,
  /null value in column/i,
  /foreign key/i,
  /check constraint/i,
  /postgrest|pgrst|supabase/i,
  /sqlstate/i,
  /pl\/pgsql/i,
  /schema cache/i,
  /could not serialize/i,
  /deadlock/i,
  /context:/i,
];

const SAFE_OPERATIONAL_ERROR =
  "The request could not be completed. Refresh and retry. If the problem persists, check Operations Health.";

const CANONICAL_APP_HOST = "company.rythm-os.com";
const LEGACY_APP_HOSTS = new Set(["rythm-os.com", "www.rythm-os.com"]);

const PROTECTED_ROUTE_PREFIXES = [
  "/actions",
  "/activation",
  "/agents",
  "/approvals",
  "/attention",
  "/command-center",
  "/decisions",
  "/executive-review",
  "/ideas",
  "/meetings",
  "/onboarding",
  "/operations",
  "/orchestrator",
  "/projects",
  "/readiness",
  "/runtime",
  "/setup/company",
  "/studio",
  "/workflow",
] as const;

const MEETING_API_LIMITS: Record<string, { limit: number; windowSeconds: number }> = {
  "/api/meetings/deliberate": { limit: 6, windowSeconds: 60 },
  "/api/meetings/summarize": { limit: 6, windowSeconds: 60 },
  "/api/meetings/legal-review": { limit: 4, windowSeconds: 60 },
  "/api/meetings/legal-triage": { limit: 10, windowSeconds: 60 },
  "/api/meetings/ceo-contribute": { limit: 30, windowSeconds: 60 },
  "/api/meetings/close": { limit: 20, windowSeconds: 60 },
};

function routeMatches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isProtectedRoute(pathname: string) {
  return PROTECTED_ROUTE_PREFIXES.some((prefix) => routeMatches(pathname, prefix));
}

function getRequestHostname(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost?.split(",")[0]?.trim() || request.headers.get("host") || "";
  return host.split(":")[0].toLowerCase();
}

function canonicalAppRedirect(request: NextRequest) {
  const hostname = getRequestHostname(request);
  if (!LEGACY_APP_HOSTS.has(hostname)) return null;

  const target = request.nextUrl.clone();
  target.protocol = "https:";
  target.hostname = CANONICAL_APP_HOST;
  target.port = "";
  return NextResponse.redirect(target, 307);
}

function sanitizeInternalError(request: NextRequest) {
  const rawError = request.nextUrl.searchParams.get("error");
  if (!rawError) return null;

  const internal =
    rawError.length > 500 ||
    INTERNAL_ERROR_PATTERNS.some((pattern) => pattern.test(rawError));

  if (!internal) return null;

  const safeUrl = request.nextUrl.clone();
  safeUrl.searchParams.set("error", SAFE_OPERATIONAL_ERROR);
  return NextResponse.redirect(safeUrl);
}

function apiError(error: string, status: number, headers?: HeadersInit) {
  return NextResponse.json(
    { ok: false, error },
    {
      status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        ...headers,
      },
    },
  );
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtected = isProtectedRoute(pathname);
  const isLogin = pathname === "/login";

  if (isLogin || isProtected) {
    const canonicalResponse = canonicalAppRedirect(request);
    if (canonicalResponse) return canonicalResponse;
  }

  const sanitizedErrorResponse = sanitizeInternalError(request);
  if (sanitizedErrorResponse) return sanitizedErrorResponse;

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const meetingApiLimit = request.method === "POST" ? MEETING_API_LIMITS[pathname] : undefined;

  if (!url || !publishableKey) {
    if (meetingApiLimit) {
      return apiError("Authentication service is not configured in this environment.", 503, { "Retry-After": "10" });
    }

    if (!isProtected) return response;

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("error", "Authentication service is not configured in this environment.");
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: SupabaseCookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (meetingApiLimit) {
    if (!user) return apiError("Authentication required.", 401);

    const scope = `meeting:${pathname.split("/").at(-1) ?? "unknown"}`;
    const { data: rateData, error: rateError } = await supabase.rpc("consume_api_rate_limit", {
      p_scope: scope,
      p_limit: meetingApiLimit.limit,
      p_window_seconds: meetingApiLimit.windowSeconds,
    });

    if (rateError) {
      console.error("api_rate_limit_failed", { path: pathname, code: rateError.code });
      return apiError("Request protection is temporarily unavailable. Retry shortly.", 503, { "Retry-After": "10" });
    }

    const rate = Array.isArray(rateData) ? rateData[0] : rateData;
    const allowed = Boolean(rate?.allowed);
    const remaining = Math.max(0, Number(rate?.remaining ?? 0));
    const retryAfter = Math.max(1, Number(rate?.retry_after_seconds ?? meetingApiLimit.windowSeconds));

    if (!allowed) {
      return apiError("Too many requests. Retry after the current rate-limit window.", 429, {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(meetingApiLimit.limit),
        "X-RateLimit-Remaining": "0",
      });
    }

    response.headers.set("X-RateLimit-Limit", String(meetingApiLimit.limit));
    response.headers.set("X-RateLimit-Remaining", String(remaining));
  }

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  if (isLogin && user) {
    const target = request.nextUrl.clone();
    target.pathname = "/command-center";
    target.search = "";
    return NextResponse.redirect(target);
  }

  return response;
}

export const config = {
  matcher: [
    "/login",
    "/activation/:path*",
    "/command-center/:path*",
    "/decisions/:path*",
    "/approvals/:path*",
    "/actions/:path*",
    "/ideas/:path*",
    "/meetings/:path*",
    "/projects/:path*",
    "/workflow/:path*",
    "/attention/:path*",
    "/executive-review/:path*",
    "/operations/:path*",
    "/agents/:path*",
    "/onboarding/:path*",
    "/orchestrator/:path*",
    "/readiness/:path*",
    "/runtime/:path*",
    "/setup/company/:path*",
    "/studio/:path*",
    "/api/meetings/:path*",
  ],
};
