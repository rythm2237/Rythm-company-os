import type { Metadata } from "next";
import "./globals.css";
import "./experience.css";
import "./project-portfolio.css";

export const metadata: Metadata = {
  title: {
    default: "RYTHM — Governed AI Companies",
    template: "%s | RYTHM",
  },
  description:
    "Build and run a governed AI company with a Human CEO, specialized AI Agents, and auditable operating controls.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
}
