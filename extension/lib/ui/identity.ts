// Who is being captured, for the overlay's header only. Read-only and best-effort: when the page
// does not provide a name or headline where expected, the overlay simply shows nothing.
// Mirrors the server parsers' selectors (lib/parsers/linkedin); capture itself never uses this.

export interface Subject {
  name: string;
  headline: string | null;
}

const DEGREE = /^· (1st|2nd|3rd\+?)$/;
const PRONOUNS = /^[A-Za-z]+\/[A-Za-z]+(\/[A-Za-z]+)?$/;

const text = (el: Element | null | undefined): string | null => {
  const t = el?.textContent?.replace(/\s+/g, " ").trim();
  return t ? t : null;
};

/** The profile's top card: name from its heading, headline from the first line after the degree marker. */
export function profileSubject(): Subject | null {
  const card = document.querySelector('[componentkey$="Topcard"], [id$="Topcard"]');
  const h2 = card?.querySelector("h2");
  const name = text(h2);
  if (!card || !h2 || !name) return null;

  const ordered = Array.from(card.querySelectorAll("h2, p"));
  const after = ordered.slice(ordered.indexOf(h2) + 1).map(text);
  let lastDegree = -1;
  after.slice(0, 6).forEach((t, i) => {
    if (t !== null && DEGREE.test(t)) lastDegree = i;
  });
  const headline =
    (lastDegree >= 0 ? after.slice(lastDegree + 1) : after).find((t) => t !== null && !t.startsWith("·") && !PRONOUNS.test(t)) ?? null;
  return { name, headline };
}

/** A post's author: name from the control menu's label, headline from the line after the actor link. */
export function postSubject(container: Element): Subject | null {
  const label = container.querySelector('button[aria-label^="Open control menu for post by "]')?.getAttribute("aria-label");
  const name = label?.replace("Open control menu for post by ", "").trim();
  if (!name) return null;

  const anchor = Array.from(container.querySelectorAll("a [aria-label]"))
    .find((el) => el.getAttribute("aria-label")?.startsWith(name))
    ?.closest("a");
  if (!anchor) return { name, headline: null };
  const ordered = Array.from(container.querySelectorAll("a, p"));
  const next = ordered
    .slice(ordered.indexOf(anchor) + 1)
    .filter((el) => el.tagName === "P" && !anchor.contains(el))
    .map(text)
    .find((t) => t !== null && !t.startsWith("•") && t !== name);
  // Pages show a follower count where people show a headline.
  return { name, headline: next && !/followers$/.test(next) ? next : null };
}
