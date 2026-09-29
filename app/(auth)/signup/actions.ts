"use server";

import { redirect } from "next/navigation";
import { recordConfirmedPublicConversion } from "@/lib/analytics/server-conversions";
import { SITE_ORIGIN } from "@/lib/seo/site";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { commercialSetupPath, selectedCommercialOffer } from "@/lib/commercial/selection";

function signupErrorMessage(error: { message?: string; code?: string; status?: number }) {
  const message = String(error.message ?? "").toLowerCase();
  const code = String(error.code ?? "").toLowerCase();

  if (message.includes("already registered") || message.includes("already been registered") || code.includes("user_already_exists")) {
    return "This email is already registered. Sign in instead, or use a different email for a separate customer account.";
  }
  if (message.includes("rate limit") || code.includes("rate_limit") || error.status === 429) {
    return "Too many signup attempts were made in a short period. Wait a few minutes, then try again.";
  }
  if (message.includes("invalid") && message.includes("email")) {
    return "Enter a valid email address.";
  }

  return "Account could not be created. Try again or use a different email address.";
}

export async function signOutForSignup(formData: FormData) {
  const supabase = await createAuthServerClient();
  await supabase.auth.signOut();
  const requested = String(formData.get("returnTo") ?? "");
  const url = new URL(requested, SITE_ORIGIN);
  const selection = selectedCommercialOffer(url.searchParams.get("product"), url.searchParams.get("template"));
  redirect(`/signup?product=${selection.productCode}${selection.templateKey ? `&template=${encodeURIComponent(selection.templateKey)}` : ""}`);
}

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const selection = selectedCommercialOffer(String(formData.get("productCode") ?? ""), String(formData.get("templateKey") ?? ""));
  const { productCode, templateKey } = selection;
  const signupPath = `/signup?product=${productCode}${templateKey ? `&template=${encodeURIComponent(templateKey)}` : ""}`;

  if (!email || !password || fullName.length < 2) {
    redirect(`${signupPath}&error=${encodeURIComponent("Name, email, and password are required.")}`);
  }
  if (password.length < 8) {
    redirect(`${signupPath}&error=${encodeURIComponent("Password must contain at least 8 characters.")}`);
  }
  if (password !== confirmPassword) {
    redirect(`${signupPath}&error=${encodeURIComponent("Passwords do not match.")}`);
  }

  const supabase = await createAuthServerClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  if (currentUser) {
    redirect(`${signupPath}&error=${encodeURIComponent(`You are already signed in as ${currentUser.email ?? "another account"}. Sign out before creating a separate customer account.`)}`);
  }

  const setupPath = commercialSetupPath(selection);
  const callbackUrl = new URL("/auth/callback", SITE_ORIGIN);
  callbackUrl.searchParams.set("next", setupPath);
  callbackUrl.searchParams.set("flow", "signup");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        selected_product_code: productCode,
        ...(templateKey ? { selected_template_key: templateKey } : {}),
      },
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    console.error("customer_signup_failed", {
      code: error.code ?? null,
      status: error.status ?? null,
      message: error.message,
    });
    redirect(`${signupPath}&error=${encodeURIComponent(signupErrorMessage(error))}`);
  }

  if (data.session && data.user) {
    await supabase.from("customer_profiles").upsert({
      user_id: data.user.id,
      full_name: fullName,
      onboarding_status: "company_pending",
      updated_at: new Date().toISOString(),
    });
    await recordConfirmedPublicConversion("confirmed_signup_conversion", "/signup", {
      method: "email",
      product: productCode,
      template: templateKey || "none",
    });
    redirect(setupPath);
  }

  const checkEmailQuery = templateKey
    ? `?product=${encodeURIComponent(productCode)}&template=${encodeURIComponent(templateKey)}`
    : `?product=${encodeURIComponent(productCode)}`;
  redirect(`/signup/check-email${checkEmailQuery}`);
}
