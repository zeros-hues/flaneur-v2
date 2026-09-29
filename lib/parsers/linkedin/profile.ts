import { requireCanaries } from "../canary";
import { blockText, lineText, parseDocument, Trace, type Doc, type El } from "../dom";
import type { ParsedProfile, ParsedTopcard, ProfilePage } from "../types";
import { parseEducation, parseExperience, parseSkills } from "./sections";
import { CANARIES, ORIGIN, profileSlug, TEXT_BOX } from "./shared";

const DEGREE = /^· (1st|2nd|3rd\+?)$/;
const PRONOUNS = /^[A-Za-z]+\/[A-Za-z]+(\/[A-Za-z]+)?$/;

function parseTopcard(doc: Doc, trace: Trace): ParsedTopcard | null {
  const card = trace.first<El>("topcard", [
    ["componentkey", () => doc.querySelector('[componentkey$="Topcard"]')],
    ["id", () => doc.querySelector('[id$="Topcard"]')],
  ]);
  if (!card) return null;
  const h2 = card.querySelector("h2");

  const name = trace.first("name", [
    ["topcard-h2", () => lineText(h2)],
    ["notify-aria-label", () =>
      card.querySelector('[aria-label^="Manage notifications about "]')
        ?.getAttribute("aria-label")?.replace("Manage notifications about ", "").trim()],
  ]);
  if (!name) return null;

  // The name row is [name, pronouns?, "· 1st", "· 2nd"]; the headline is the next line after it.
  const ordered = Array.from(card.querySelectorAll("h2, p")) as El[];
  const after = ordered.slice(h2 ? ordered.indexOf(h2) + 1 : 0).map(lineText);
  const headline = trace.first("headline", [
    ["after-degree-marker", () => {
      const lastDegree = after.slice(0, 6).findLastIndex((t) => t !== null && DEGREE.test(t));
      return lastDegree >= 0 ? after.slice(lastDegree + 1).find((t) => t !== null && !t.startsWith("·")) : null;
    }],
    ["first-non-pronoun-line", () => after.find((t) => t !== null && !t.startsWith("·") && !PRONOUNS.test(t))],
  ]);

  const location = trace.first("location", [
    ["contact-info-row", () =>
      lineText(doc.querySelector('a[href*="/overlay/contact-info/"]')?.closest("p")?.parentElement?.querySelector("p"))],
    ["before-dot-separator", () => {
      const dot = after.findIndex((t) => t === "·");
      return dot > 0 ? after[dot - 1] : null;
    }],
  ]);

  const photoUrl = trace.first("photo", [
    ["topcard-logo-key", () => doc.querySelector('[componentkey="topcard-logo-image-referencekey"] img')?.getAttribute("src")],
    ["profile-photo-label", () => doc.querySelector('[aria-label="Profile photo"] img')?.getAttribute("src")],
  ]);

  return { name, headline, location, photoUrl };
}

/**
 * undefined: the card never rendered (LinkedIn lazy-loads it as an empty shell), so leave it alone.
 * null: the card rendered and has no text.
 */
function parseAbout(doc: Doc, trace: Trace): string | null | undefined {
  const card = trace.first<El>("about.card", [
    ["componentkey", () => doc.querySelector('[componentkey$="About"]')],
    ["id", () => doc.querySelector('[id$="About"]')],
  ]);
  if (!card) return undefined;
  const text = blockText(card.querySelector(TEXT_BOX));
  if (text) return text;
  return card.querySelector("h2") ? null : undefined;
}

export function parseProfile(html: string, url: string, page: ProfilePage): ParsedProfile {
  const slug = profileSlug(url);
  if (!slug) throw new Error(`no profile slug in ${url}`);

  const doc = parseDocument(html);
  requireCanaries(doc, CANARIES[page]);
  const trace = new Trace();

  const profile: ParsedProfile = {
    profileUrl: `${ORIGIN}/in/${slug}/`,
    page,
    topcard: page === "main" ? parseTopcard(doc, trace) : null,
    strategies: trace.won,
  };
  const experience = parseExperience(doc, page, trace);
  if (experience) profile.experience = experience;

  if (page === "main") {
    const about = parseAbout(doc, trace);
    const education = parseEducation(doc, trace);
    const skills = parseSkills(doc, trace);
    if (about !== undefined) profile.about = about;
    if (education) profile.education = education;
    if (skills) profile.skills = skills;
  }
  return profile;
}
