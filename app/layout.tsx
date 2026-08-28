import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import {
  DEFAULT_DESCRIPTION,
  SITE_NAME,
  SITE_ORIGIN,
  SOCIAL_IMAGE_PATH,
} from "@/lib/seo/site";
import "./globals.css";
import "./experience.css";
import "./project-portfolio.css";
import "./ui-consistency.css";

const vazirmatn = localFont({
  src: "./fonts/Vazirmatn[wght].woff2",
  variable: "--font-vazirmatn",
  display: "swap",
  preload: false,
  weight: "100 900",
  style: "normal",
  fallback: ["Tahoma", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: "RYTHM Company OS — Governed AI Company Operating System",
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "technology",
  creator: SITE_NAME,
  publisher: SITE_NAME,
  referrer: "origin-when-cross-origin",
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: "RYTHM Company OS — Governed AI Company Operating System",
    description: DEFAULT_DESCRIPTION,
    locale: "en_US",
    images: [
      {
        url: SOCIAL_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: "RYTHM Company OS — the governed AI company operating system",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RYTHM Company OS — Governed AI Company Operating System",
    description: DEFAULT_DESCRIPTION,
    images: [SOCIAL_IMAGE_PATH],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F7FB" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1220" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={vazirmatn.variable}>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
}
