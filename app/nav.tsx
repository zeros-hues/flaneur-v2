"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

const ITEMS = [
  { href: "/", label: "the street" },
  { href: "/walk", label: "the walk" },
  { href: "/atlas", label: "atlas" },
  { href: "/settings", label: "settings" },
] as const;

function isActive(path: string, href: string): boolean {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

export function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <header className="topbar">
      <Link href="/" className="topbar__name">
        flaneur
      </Link>
      <nav className="topbar__links" aria-label="Main">
        {ITEMS.map((item, i) => (
          <Fragment key={item.href}>
            {i > 0 ? (
              <span className="topbar__dot" aria-hidden="true">
                ·
              </span>
            ) : null}
            <Link href={item.href} aria-current={isActive(path, item.href) ? "page" : undefined}>
              {item.label}
            </Link>
          </Fragment>
        ))}
      </nav>
    </header>
  );
}
