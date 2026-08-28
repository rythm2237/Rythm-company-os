"use server";

import { redirect } from "next/navigation";
import { SITE_ORIGIN } from "@/lib/seo/site";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

const selectableTemplates = new Set([
  "ready_saas_startup_v1",
  "ready_ai_advertising_agency_v1",
  "ready_software_company_v1",
]);

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

export async function signOutForSignup() {
  const supabase = await createAuthServerClient();
  await supabase.auth.signOut();
  redirect("/signup");
}

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const requestedProduct = String(formData.get("productCode") ?? "company_studio");
  const productCode = requestedProduct === "ready_company" ? "ready_company" : "company_studio";
  const requestedTemplate = String(formData.get("templateKey") ?? "").trim();
  const templateKey = selectableTemplates.has(requestedTemplate) ? requestedTemplate : "";

  if (!email || !password || fullName.length < 2) {
    redirect(`/signup?error=${encodeURIComponent("Name, email, and password are required.")}`);
  }
  if (password.length < 8) {
    redirect(`/signup?error=${encodeURIComponent("Password must contain at least 8 characters.")}`);
  }
  if (password !== confirmPassword) {
    redirect(`/signup?error=${encodeURIComponent("Passwords do not match.")}`);
  }

  const supabase = await createAuthServerClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  if (currentUser) {
    redirect(`/signup?error=${encodeURIComponent(`You are already signed in as ${currentUser.email ?? "another account"}. Sign out before creating a separate customer account.`)}`);
  }

  const setupPath = templateKey
    ? `/setup/company?product=${encodeURIComponent(productCode)}&template=${encodeURIComponent(templateKey)}`
    : "/demo";
  const confirmationRedirect = `${SITE_ORIGIN}/auth/callback?next=${encodeURIComponent(setupPath)}`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        selected_product_code: productCode,
        ...(templateKey ? { selected_template_key: templateKey } : {}),
      },
      emailRedirectTo: confirmationRedirect,
    },
  });

  if (error) {
    console.error("customer_signup_failed", {
      code: error.code ?? null,
      status: error.status ?? null,
      message: error.message,
    });
    redirect(`/signup?error=${encodeURIComponent(signupErrorMessage(error))}`);
  }

  if (data.session && data.user) {
    await supabase.from("customer_profiles").upsert({
      user_id: data.user.id,
      full_name: fullName,
      onboarding_status: "company_pending",
      updated_at: new Date().toISOString(),
    });
    redirect(setupPath);
  }

  const checkEmailQuery = templateKey
    ? `?product=${encodeURIComponent(productCode)}&template=${encodeURIComponent(templateKey)}`
    : `?product=${encodeURIComponent(productCode)}`;
  redirect(`/signup/check-email${checkEmailQuery}`);
}
