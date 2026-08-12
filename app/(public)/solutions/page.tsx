import type { Metadata } from "next";
import Link from "next/link";
import { SOLUTION_PATHS } from "@/lib/public-experience/content";

export const metadata: Metadata = {
  title: "Solutions",
  description: "Compare Ready AI Company, Custom AI Company, and Enterprise AI Workforce paths by the way your organization needs to operate.",
};

export default function SolutionsPage() {
  return (
    <main>
      <section className="public-page-hero solutions-hero">
        <div><p className="marketing-kicker">SOLUTIONS</p><h1>Start from the operating model you need—not from internal product architecture.</h1></div>
        <p>Choose a path only after you understand the difference between a predefined AI company, a self-designed company, and an enterprise workforce deployment.</p>
      </section>
      <section className="marketing-section solution-path-list">
        {SOLUTION_PATHS.map((path, index) => (
          <article key={path.id}>
            <div className="solution-index">0{index + 1}</div>
            <div><p className="marketing-kicker">{path.eyebrow}</p><h2>{path.title}</h2><p className="solution-audience"><strong>Best for:</strong> {path.audience}</p><p>{path.description}</p></div>
            <div><ul>{path.outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul><Link href={path.href}>{path.cta} <span aria-hidden="true">→</span></Link></div>
          </article>
        ))}
      </section>
      <section className="marketing-cta"><p className="marketing-kicker">EXPERIENCE FIRST</p><h2>See the Company OS before comparing commercial options.</h2><div className="hero-actions"><Link className="marketing-button" href="/demo">Open Demo Workspace</Link><Link href="/pricing">View comparison</Link></div></section>
    </main>
  );
}

