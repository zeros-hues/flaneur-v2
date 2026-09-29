// LinkedIn adapter internals. Snapshots are serialised by the extension with class/style stripped,
// so selectors use only data-testid, componentkey, id, aria-label, role and href, all observed in
// real captured HTML.
import type { Canary } from "../canary";
import { lineText, type El } from "../dom";
import type { ProfilePage } from "../types";

export const ORIGIN = "https://www.linkedin.com";
export const TEXT_BOX = '[data-testid="expandable-text-box"]';
const PRIMARY = { name: "primary-content", selectors: ['section[aria-label="Primary content"]'] };

export const CANARIES: Record<ProfilePage | "artifact", Canary[]> = {
  main: [
    PRIMARY,
    { name: "topcard", selectors: ['[componentkey$="Topcard"]', '[id$="Topcard"]'] },
    { name: "topcard-name", selectors: ['[componentkey$="Topcard"] h2', '[id$="Topcard"] h2'] },
  ],
  experience: [
    PRIMARY,
    {
      name: "experience-details-list",
      selectors: [
        '[data-testid^="profile_ExperienceDetailsSection_"]',
        '[componentkey$="ExperienceDetailsSection"]',
      ],
    },
  ],
  artifact: [
    { name: "update-card", selectors: ['[role="listitem"][componentkey^="update-card-focus"]'] },
    { name: "control-menu", selectors: ['button[aria-label^="Open control menu for post by "]'] },
  ],
};

export function pathOf(url: string): string {
  return new URL(url).pathname.replace(/\/+$/, "") + "/";
}

export function profileSlug(url: string): string | null {
  const match = /^\/in\/([^/]+)\//.exec(pathOf(url));
  return match?.[1] ? decodeURIComponent(match[1]).toLowerCase() : null;
}

export type EntityKind = "in" | "company" | "showcase" | "school";

/** "/company/13018048/" → { kind: "company", slug: "13018048" }. */
export function entityFromHref(href: string | null | undefined): { kind: EntityKind; slug: string } | null {
  const match = /\/(in|company|showcase|school)\/([^/?#]+)/.exec(href ?? "");
  if (!match?.[1] || !match[2]) return null;
  return { kind: match[1] as EntityKind, slug: decodeURIComponent(match[2]).toLowerCase() };
}

export function toInt(text: string | null | undefined): number | null {
  const digits = text?.replace(/[^\d]/g, "") ?? "";
  return digits === "" ? null : Number(digits);
}

/** Paragraph lines of `scope`, skipping description paragraphs and anything inside `exclude`. */
export function lines(scope: El, exclude?: El | null): string[] {
  return (Array.from(scope.querySelectorAll("p")) as El[])
    .filter((p) => !p.querySelector(TEXT_BOX) && !(exclude && exclude.contains(p)))
    .map(lineText)
    .filter((t): t is string => t !== null);
}
