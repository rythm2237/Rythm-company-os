"use server";

import type { Provider } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { SITE_ORIGIN } from "@/lib/seo/site";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

type SupportedOAuthProvider = "google" | "azure";

const SUPPORTED_PROVIDERS = new Set<SupportedOAuthProvider>(["google", "azure"]);

function safeInternalPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/command-center";
  return value;
}

function providerLabel(provider: SupportedOAuthProvider) {
  return provider === "google" ? "Google" : "Microsoft";
}

export async function signInWithOAuth(formData: FormData) {
  const rawProvider = String(formData.get("provider") ?? "").toLowerCase();
  const source = formData.get("source") === "signup" ? "signup" : "login";
  const requestedNext = String(formData.get("next") ?? "/command-center");
  const next = source === "signup" ? "/demo" : safeInternalPath(requestedNext);

  if (!SUPPORTED_PROVIDERS.has(rawProvider as SupportedOAuthProvider)) {
    redirect(`/${source}?error=${encodeURIComponent("Unsupported sign-in provider.")}`);
  }

  const provider = rawProvider as SupportedOAuthProvider;
  const callbackUrl = new URL("/auth/callback", SITE_ORIGIN);
  callbackUrl.searchParams.set("next", next);
  callbackUrl.searchParams.set("flow", "oauth");

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
    redirect(`/${source}?error=${encodeURIComponent(`${providerLabel(provider)} sign-in is not available yet. Try email and password instead.`)}`);
  }

  redirect(data.url);
}
