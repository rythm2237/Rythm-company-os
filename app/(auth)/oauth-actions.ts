"use server";

import type { Provider } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { SITE_ORIGIN } from "@/lib/seo/site";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

type SupportedOAuthProvider = "google" | "azure";

const SUPPORTED_PROVIDERS = new Set<SupportedOAuthProvider>(["google", "azure"]);
const SELECTABLE_TEMPLATES = new Set([
  "ready_saas_startup_v1",
  "ready_ai_advertising_agency_v1",
  "ready_software_company_v1",
]);

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
  const requestedProduct = String(formData.get("productCode") ?? "company_studio");
  const productCode = requestedProduct === "ready_company" ? "ready_company" : "company_studio";
  const requestedTemplate = String(formData.get("templateKey") ?? "").trim();
  const templateKey = SELECTABLE_TEMPLATES.has(requestedTemplate) ? requestedTemplate : "";
  const signupNext = templateKey
    ? `/setup/company?product=${encodeURIComponent(productCode)}&template=${encodeURIComponent(templateKey)}`
    : "/demo";
  const next = source === "signup" ? signupNext : safeInternalPath(requestedNext);

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
