import type { Metadata } from "next";
import Link from "next/link";
import "./marketing.css";

export const metadata: Metadata = {
  title: "Governed AI Companies",
};

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="marketing-site">
      <header className="marketing-header">
        <Link className="marketing-brand" href="/" aria-label="RYTHM home">
          <span aria-hidden="true">R</span>
          <strong>RYTHM</strong>
        </Link>
        <nav aria-label="Public navigation">
          <Link href="/#products">Products</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/contact">Enterprise</Link>
        </nav>
        <div className="marketing-actions">
          <Link href="/login">Sign in</Link>
          <Link className="marketing-button" href="/signup">Build your company</Link>
        </div>
      </header>
      {children}
      <footer className="marketing-footer">
        <div><strong>RYTHM</strong><p>Governed AI companies under Human CEO authority.</p></div>
        <div><Link href="/pricing">Pricing</Link><Link href="/contact">Enterprise Beta</Link><Link href="/login">Customer sign in</Link></div>
      </footer>
    </div>
  );
}
