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

export async function middleware(request: NextRequest) {
  const sanitizedErrorResponse = sanitizeInternalError(request);
  if (sanitizedErrorResponse) return sanitizedErrorResponse;

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return response;

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

  const isProtected = request.nextUrl.pathname.startsWith("/command-center");
  const isLogin = request.nextUrl.pathname === "/login";

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
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
  ],
};
