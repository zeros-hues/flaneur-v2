"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <header className="topbar">
      {/* The home route is search: the name is its link. */}
      <Link href="/" className="topbar__name" aria-current={path === "/" ? "page" : undefined}>
        flaneur
      </Link>
      <nav className="topbar__links" aria-label="Main">
        <Link href="/walk" aria-current={path === "/walk" ? "page" : undefined}>
          walk
        </Link>
        <span>
          <span className="quiet" aria-hidden="true">· </span>
          <a href="/flaneur-extension.zip" className="quiet">
            download extension
          </a>
        </span>
      </nav>
    </header>
  );
}
