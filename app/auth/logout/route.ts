import { NextRequest, NextResponse } from "next/server";
import { endSession } from "@/lib/auth/logout";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Native POST navigation avoids protected-page middleware and the RSC action queue.
  const origin = request.headers.get("origin");
  if (origin !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Sign out is temporarily unavailable. Please retry." }, { status: 503 });

  const { revoked, cookieNames } = await endSession({ url, key, cookies: request.cookies.getAll() });
  const destination = new URL("/login", request.url);
  if (!revoked) destination.searchParams.set("message", "Signed out on this device. The authentication service could not confirm remote session revocation.");
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  for (const name of [...cookieNames, "rythm_active_org"]) {
    response.cookies.set(name, "", { path: "/", maxAge: 0, expires: new Date(0), sameSite: "lax", secure: request.nextUrl.protocol === "https:" });
  }
  return response;
}
