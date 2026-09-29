import Link from "next/link";
import { commercialSetupPath, commercialSignupPath, selectedCommercialOffer } from "@/lib/commercial/selection";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ product?: string; template?: string; error?: string }> };

export default async function SignupCheckEmailPage({ searchParams }: Props) {
  const params = await searchParams;
  const selection = selectedCommercialOffer(params.product, params.template);

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="check-email-title">
        <div>
          <p className="eyebrow">ONE MORE STEP</p>
          <h1 id="check-email-title" className="auth-title">Confirm your email</h1>
          <p className="auth-copy">
            We sent a confirmation email to the address you entered. Open that email and select the
            confirmation link. After verification, RYTHM will bring you back securely to company setup.
          </p>
        </div>

        {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}

        <div className="auth-form" style={{ marginTop: 18 }}>
          <p className="security-note" style={{ margin: 0 }}>
            The confirmation link is single-use. If you requested more than one email, use the newest message.
          </p>
          <p className="security-note" style={{ margin: 0 }}>
            If this email address already belonged to an older RYTHM account, your existing password may still apply.
            If sign-in fails after confirmation, use password reset rather than creating the same account again.
          </p>
          <Link href={`/login?next=${encodeURIComponent(commercialSetupPath(selection))}`}>I already confirmed my email</Link>
          <Link href="/forgot-password">I need to reset my password</Link>
          <Link href={commercialSignupPath(selection)}>Use a different email address</Link>
        </div>

        <p className="security-note">
          Do not create a company or activate paid capabilities until your email identity has been verified.
        </p>
      </section>
    </main>
  );
}
