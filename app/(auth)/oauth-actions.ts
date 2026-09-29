"use server";

import type { Provider } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SITE_ORIGIN } from "@/lib/seo/site";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { commercialSetupPath, commercialSignupPath, selectedCommercialOffer } from "@/lib/commercial/selection";

type SupportedOAuthProvider = "google" | "azure";

const SUPPORTED_PROVIDERS = new Set<SupportedOAuthProvider>(["google", "azure"]);

function safeInternalPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/home";
  return value;
}

function providerLabel(provider: SupportedOAuthProvider) {
  return provider === "google" ? "Google" : "Microsoft";
}

function isAllowedAuthHost(host: string) {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  return (
    hostname === "rythm-os.com" ||
    hostname === "www.rythm-os.com" ||
    hostname === "company.rythm-os.com" ||
    hostname.endsWith(".vercel.app") ||
    hostname === "localhost" ||
    hostname === "127.0.0.1"
  );
}

async function requestOrigin() {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || requestHeaders.get("host")?.trim() || "";
  if (!host || !isAllowedAuthHost(host)) return SITE_ORIGIN;

  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const protocol = forwardedProto === "http" && (host.startsWith("localhost") || host.startsWith("127.0.0.1")) ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function signInWithOAuth(formData: FormData) {
  const rawProvider = String(formData.get("provider") ?? "").toLowerCase();
  const source = formData.get("source") === "signup" ? "signup" : "login";
  const requestedNext = String(formData.get("next") ?? "/home");
  const selection = selectedCommercialOffer(String(formData.get("productCode") ?? ""), String(formData.get("templateKey") ?? ""));
  const signupNext = commercialSetupPath(selection);
  const next = source === "signup" ? signupNext : safeInternalPath(requestedNext);
  const retryPath = source === "signup" ? commercialSignupPath(selection) : `/login?next=${encodeURIComponent(next)}`;

  if (!SUPPORTED_PROVIDERS.has(rawProvider as SupportedOAuthProvider)) {
    redirect(`${retryPath}&error=${encodeURIComponent("Unsupported sign-in provider.")}`);
  }

  const provider = rawProvider as SupportedOAuthProvider;
  const callbackUrl = new URL("/auth/callback", await requestOrigin());
  callbackUrl.searchParams.set("next", next);
  callbackUrl.searchParams.set("flow", source === "signup" ? "oauth_signup" : "oauth");
  callbackUrl.searchParams.set("provider", provider);

  const supabase = await createAuthServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as Provider,
    options: {
      redirectTo: callbackUrl.toString(),
      ...(provider === "azure" ? { scopes: "email" } : {}),
    },
  });

  if (error || !data.url) {
    console.error("social_oauth_start_failed", {
      provider,
      code: error?.code ?? null,
      status: error?.status ?? null,
      message: error?.message ?? "OAuth provider did not return a redirect URL.",
    });
    redirect(`${retryPath}&error=${encodeURIComponent(`${providerLabel(provider)} sign-in is not available yet. Try email and password instead.`)}`);
  }

  redirect(data.url);
}
