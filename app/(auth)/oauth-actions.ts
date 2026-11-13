"use server";

import type { Provider } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authCallbackOrigin, safeAuthPath } from "@/lib/auth/redirect";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { commercialSetupPath, commercialSignupPath, selectedCommercialOffer } from "@/lib/commercial/selection";

type SupportedOAuthProvider = "google" | "azure";

const SUPPORTED_PROVIDERS = new Set<SupportedOAuthProvider>(["google", "azure"]);

function providerLabel(provider: SupportedOAuthProvider) {
  return provider === "google" ? "Google" : "Microsoft";
}

export async function signInWithOAuth(formData: FormData) {
  const rawProvider = String(formData.get("provider") ?? "").toLowerCase();
  const source = formData.get("source") === "signup" ? "signup" : "login";
  const requestedNext = String(formData.get("next") ?? "/home");
  const selection = selectedCommercialOffer(String(formData.get("productCode") ?? ""), String(formData.get("templateKey") ?? ""));
  const signupNext = commercialSetupPath(selection);
  const next = source === "signup" ? signupNext : safeAuthPath(requestedNext);
  const retryPath = source === "signup" ? commercialSignupPath(selection) : `/login?next=${encodeURIComponent(next)}`;

  if (!SUPPORTED_PROVIDERS.has(rawProvider as SupportedOAuthProvider)) {
    redirect(`${retryPath}&error=${encodeURIComponent("Unsupported sign-in provider.")}`);
  }

  const provider = rawProvider as SupportedOAuthProvider;
  const callbackUrl = new URL("/auth/callback", authCallbackOrigin(process.env, (await headers()).get("host") ?? undefined));
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
