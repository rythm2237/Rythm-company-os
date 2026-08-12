"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const groups = [
  {
    label: "Operate",
    items: [
      ["Command", "/command-center"],
      ["Project", "/projects"],
      ["Actions", "/actions"],
    ],
  },
  {
    label: "Build",
    items: [
      ["Agents", "/studio/agents"],
      ["Templates", "/studio/templates"],
      ["Company Builder", "/studio/builder"],
    ],
  },
  {
    label: "Govern",
    items: [
      ["Ideas", "/ideas"],
      ["Boardroom", "/meetings/room"],
      ["Traceability", "/workflow/traceability"],
    ],
  },
  {
    label: "Review",
    items: [
      ["Attention", "/attention"],
      ["Executive Review", "/executive-review"],
      ["Economics", "/meetings/economics"],
      ["Operations Health", "/operations/health"],
    ],
  },
] as const;

function active(pathname: string, href: string) {
  if (href === "/command-center") return pathname === href;
  if (href === "/projects") return pathname === "/projects" || pathname.startsWith("/projects/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function ProductNav() {
  const pathname = usePathname();
  if (!pathname || pathname.startsWith("/login") || pathname.startsWith("/signup") || pathname.startsWith("/setup/") || pathname.startsWith("/forgot-password") || pathname.startsWith("/reset-password") || pathname.startsWith("/auth/")) return null;

  return (
    <nav className="product-nav" aria-label="RYTHM primary navigation">
      <div className="product-nav-inner">
        <Link className="product-brand" href="/command-center" aria-label="RYTHM Command Center">
          <span className="product-brand-mark" aria-hidden="true">R</span>
          <span><strong>RYTHM</strong><small>Company OS</small></span>
        </Link>

        <div className="product-nav-groups">
          {groups.map((group) => (
            <div className="product-nav-group" key={group.label}>
              <span className="product-nav-label">{group.label}</span>
              <div className="product-nav-links">
                {group.items.map(([label, href]) => (
                  <Link
                    key={href}
                    href={href}
                    className={active(pathname, href) ? "product-nav-link is-active" : "product-nav-link"}
                    aria-current={active(pathname, href) ? "page" : undefined}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <Link className="product-onboarding-link" href="/onboarding">MVP Guide</Link>
      </div>
    </nav>
  );
}
