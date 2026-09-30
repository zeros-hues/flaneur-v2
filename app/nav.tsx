"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "search" },
  { href: "/ask", label: "ask" },
  { href: "/walk", label: "walk" },
] as const;

export function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <header className="topbar">
      <span className="topbar__name">flaneur</span>
      <nav className="topbar__links" aria-label="Main">
        {LINKS.map((link, i) => (
          <span key={link.href}>
            {i > 0 && <span className="quiet" aria-hidden="true">· </span>}
            <Link href={link.href} aria-current={path === link.href ? "page" : undefined}>
              {link.label}
            </Link>
          </span>
        ))}
        <a href="/flaneur-extension.zip" className="quiet">
          download extension
        </a>
      </nav>
    </header>
  );
}
