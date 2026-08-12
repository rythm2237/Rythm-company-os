import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="auth-route">
      <Link className="auth-home-link" href="/">RYTHM</Link>
      {children}
    </div>
  );
}
