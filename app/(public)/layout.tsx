import type { Metadata } from "next";
import Link from "next/link";
import { PUBLIC_NAVIGATION } from "@/lib/public-experience/content";
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
        <nav className="marketing-desktop-nav" aria-label="Public navigation">
          {PUBLIC_NAVIGATION.map((item) => <Link data-compact={item.compact || undefined} href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
        <div className="marketing-actions">
          <Link href="/login">Sign in</Link>
          <Link className="marketing-button" href="/signup">Get Started</Link>
        </div>
        <details className="marketing-mobile-menu">
          <summary>Explore <span aria-hidden="true">+</span></summary>
          <nav aria-label="Mobile public navigation">
            {PUBLIC_NAVIGATION.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
            <Link href="/login">Login</Link>
          </nav>
        </details>
      </header>
      {children}
      <footer className="marketing-footer">
        <div><strong>RYTHM</strong><p>Governed AI companies under Human CEO authority.</p></div>
        <div><Link href="/product">Product</Link><Link href="/demo">Demo</Link><Link href="/templates">Templates</Link><Link href="/pricing">Pricing</Link><Link href="/enterprise">Enterprise Beta</Link><Link href="/login">Customer sign in</Link></div>
      </footer>
    </div>
  );
}
