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

type Props = {
  access: {
    active: boolean;
    agentStudio: boolean;
    templates: boolean;
    companyBuilder: boolean;
  };
};

function active(pathname: string, href: string) {
  if (href === "/command-center") return pathname === href;
  if (href === "/projects") return pathname === "/projects" || pathname.startsWith("/projects/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function canShowItem(href: string, access: Props["access"]) {
  if (href === "/studio/agents") return access.agentStudio;
  if (href === "/studio/templates") return access.templates;
  if (href === "/studio/builder") return access.companyBuilder;
  return true;
}

export default function ProductNav({ access }: Props) {
  const pathname = usePathname();
  if (!pathname) return null;

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(([, href]) => canShowItem(href, access)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <nav className="product-nav" aria-label="RYTHM primary navigation">
      <div className="product-nav-inner">
        <Link className="product-brand" href="/command-center" aria-label="RYTHM Command Center">
          <span className="product-brand-mark" aria-hidden="true">R</span>
          <span><strong>RYTHM</strong><small>Company OS</small></span>
        </Link>

        <div className="product-nav-groups">
          {visibleGroups.map((group) => (
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

        <Link
          className="product-onboarding-link"
          href={access.active ? "/onboarding" : "/activation"}
        >
          {access.active ? "MVP Guide" : "Activation"}
        </Link>
      </div>
    </nav>
  );
}
