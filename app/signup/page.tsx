import Link from "next/link";
import { signup } from "./actions";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="signup-title">
        <div>
          <p className="eyebrow">RYTHM PAID PUBLIC BETA</p>
          <h1 id="signup-title" className="auth-title">Create your Human CEO account</h1>
          <p className="auth-copy">Create a B2B account first. Your governed AI company is provisioned in the next step.</p>
        </div>
        {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}
        <form action={signup} className="auth-form">
          <label>Full name<input name="fullName" autoComplete="name" required minLength={2} maxLength={120}/></label>
          <label>Work email<input name="email" type="email" autoComplete="email" required/></label>
          <label>Password<input name="password" type="password" autoComplete="new-password" required minLength={8}/></label>
          <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8}/></label>
          <button type="submit">Create account</button>
        </form>
        <p className="security-note">B2B Public Beta. AI Agents remain governed by Human CEO authority and external actions remain disabled by default.</p>
        <p className="security-note">Already registered? <Link href="/login">Sign in</Link></p>
      </section>
    </main>
  );
}
