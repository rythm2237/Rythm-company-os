import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { signInWithOAuth } from "../oauth-actions";
import { signup, signOutForSignup } from "./actions";
import { commercialSetupPath, commercialSignupPath, selectedCommercialOffer } from "@/lib/commercial/selection";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string; product?: string; template?: string }> };

export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams;
  if (!params.product && !params.template) redirect("/pricing");
  const selection = selectedCommercialOffer(params.product, params.template);
  const selectedProduct = selection.productCode;
  const selectedTemplate = selection.templateKey;
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: memberships } = user
    ? await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).limit(1)
    : { data: null };
  const loginNext = commercialSetupPath(selection);

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="signup-title">
        <div>
          <p className="eyebrow">RYTHM PAID PUBLIC BETA</p>
          <h1 id="signup-title" className="auth-title">Create your Human CEO account</h1>
          <p className="auth-copy">Create a B2B account, reserve your company, then request assisted activation. No order or payment is created by signup.</p>
          {selectedTemplate ? <p className="security-note">Your selected Ready Company will remain selected through setup and activation.</p> : null}
        </div>

        {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}

        {user ? (
          <div className="auth-form" style={{ marginTop: 18 }}>
            <p className="form-error" role="alert" style={{ margin: 0 }}>
              You are currently signed in as {user.email ?? "an existing account"}.
            </p>
            <Link href={memberships?.length
              ? selectedTemplate ? `/studio/templates?template=${encodeURIComponent(selectedTemplate)}` : "/studio/templates"
              : commercialSetupPath(selection)}>
              Continue with this account
            </Link>
            <form action={signOutForSignup}>
              <input type="hidden" name="returnTo" value={commercialSignupPath(selection)} />
              <button type="submit">Sign out and create another account</button>
            </form>
            <Link href="/home">Return to current company</Link>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gap: 10, marginTop: 24 }} aria-label="Social account options">
              <form action={signInWithOAuth}>
                <input type="hidden" name="provider" value="google" />
                <input type="hidden" name="source" value="signup" />
                <input type="hidden" name="productCode" value={selectedProduct} />
                <input type="hidden" name="templateKey" value={selectedTemplate} />
                <button className="secondary-button" style={{ width: "100%" }} type="submit">
                  Continue with Google
                </button>
              </form>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22, color: "#788296", fontSize: ".78rem" }}>
              <span style={{ height: 1, background: "#e1e5ec", flex: 1 }} />
              <span>or create with work email</span>
              <span style={{ height: 1, background: "#e1e5ec", flex: 1 }} />
            </div>

            <form action={signup} className="auth-form">
              <input type="hidden" name="productCode" value={selectedProduct} />
              <input type="hidden" name="templateKey" value={selectedTemplate} />
              <label>Full name<input name="fullName" autoComplete="name" required minLength={2} maxLength={120}/></label>
              <label>Work email<input name="email" type="email" autoComplete="email" required/></label>
              <label>Password<input name="password" type="password" autoComplete="new-password" required minLength={8}/></label>
              <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8}/></label>
              <button type="submit">Create account</button>
            </form>
          </>
        )}

        <p className="security-note">B2B Public Beta. AI Agents remain governed by Human CEO authority and external actions remain disabled by default.</p>
        <p className="security-note">Already registered? <Link href={`/login?next=${encodeURIComponent(loginNext)}`}>Sign in</Link></p>
      </section>
    </main>
  );
}
