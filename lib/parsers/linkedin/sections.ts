// Experience, education and skills: list sections that share the same card / LazyColumn shape.
import { ABSENT, parseDateRange } from "../dates";
import { blockText, lineText, outermost, type Doc, type El, type Trace } from "../dom";
import type { ParsedEducation, ParsedRole, ProfilePage, Section } from "../types";
import { entityFromHref, lines, TEXT_BOX, toInt } from "./shared";

interface Located {
  card: El;
  container: El;
}

/** `key` is the card suffix, e.g. "ExperienceTopLevelSection" or "Skills". */
function locate(doc: Doc, key: string, field: string, trace: Trace): Located | null {
  const container = trace.first<El>(`${field}.container`, [
    ["testid", () => doc.querySelector(`[data-testid^="profile_${key}_"]`)],
    ["componentkey", () => doc.querySelector(`[componentkey$="${key}"] [data-component-type="LazyColumn"]`)],
  ]);
  if (!container) return null;
  return { container, card: container.closest(`[componentkey$="${key}"]`) ?? container.closest("section") ?? container };
}

/** "Show all" means the main-page card is truncated; a "(25)" in the heading gives the total. */
function coverage<T>(found: Located, items: T[], detailsPath: string): Section<T> {
  const showAll = found.card.querySelector(`a[href*="/details/${detailsPath}"]`);
  const headingTotal = toInt(/\((\d[\d,]*)\)/.exec(lineText(found.card.querySelector("h2")) ?? "")?.[1]);
  const knownTotal = headingTotal ?? (showAll ? toInt(lineText(showAll)) : items.length);
  return { items, complete: !showAll, knownTotal };
}

// ---- experience -------------------------------------------------------------------------------

const DURATION = /\b\d+\s+(?:yrs?|mos?)\b/;

function roleFromLines(
  ls: string[],
  company: { name: string | null; slug: string | null; location: string | null },
  description: string | null,
  grouped: boolean,
): ParsedRole | null {
  const title = ls[0];
  if (!title) return null;
  const dateIdx = ls.findIndex((l) => parseDateRange(l) !== null);
  const range = dateIdx >= 0 ? parseDateRange(ls[dateIdx] ?? "") : null;
  // Single-role items carry a "Company · Employment type" line between title and dates.
  const companyLine = grouped ? null : dateIdx === 1 ? null : ls[1];
  return {
    title,
    companyName: companyLine?.split(" · ")[0]?.trim() || company.name,
    companySlug: company.slug,
    location: (dateIdx >= 0 ? ls[dateIdx + 1] : undefined) ?? company.location,
    start: range?.start ?? ABSENT,
    end: range?.end ?? ABSENT,
    isCurrent: range?.isCurrent ?? false,
    description,
  };
}

/** One entity-collection-item → one role, or several when roles are grouped under one company. */
function parseExperienceItem(item: El): ParsedRole[] {
  const link = item.querySelector('a[href*="/company/"], a[href*="/school/"], a[href*="/showcase/"]');
  const slug = entityFromHref(link?.getAttribute("href"))?.slug ?? null;
  const logoName = item.querySelector("img[alt$=' logo']")?.getAttribute("alt")?.replace(/ logo$/, "") ?? null;

  const list = item.querySelector("ul");
  const subItems = list ? (Array.from(list.querySelectorAll("li")) as El[]) : [];
  const grouped = subItems.some((li) => lines(li).some((l) => parseDateRange(l) !== null));

  if (!grouped) {
    const role = roleFromLines(lines(item), { name: logoName, slug, location: null }, blockText(item.querySelector(TEXT_BOX)), false);
    return role ? [role] : [];
  }

  // Grouped: header is [company, total duration, location]; each <li> is its own role.
  const header = lines(item, list);
  const company = {
    name: header[0] ?? logoName,
    slug,
    location: header.slice(1).find((l) => !DURATION.test(l)) ?? null,
  };
  return subItems.flatMap((li) => {
    const role = roleFromLines(lines(li), company, blockText(li.querySelector(TEXT_BOX)), true);
    return role ? [role] : [];
  });
}

export function parseExperience(doc: Doc, page: ProfilePage, trace: Trace): Section<ParsedRole> | undefined {
  const key = page === "main" ? "ExperienceTopLevelSection" : "ExperienceDetailsSection";
  const found = locate(doc, key, "experience", trace);
  if (!found) return undefined;
  const items = outermost(found.container, '[componentkey^="entity-collection-item"]').flatMap(parseExperienceItem);
  if (page === "experience") return { items, complete: true, knownTotal: items.length };
  return coverage(found, items, "experience");
}

// ---- education --------------------------------------------------------------------------------

const EDUCATION_EXTRA = /^(Activities and societies|Grade):/i;

function parseEducationItem(item: El): ParsedEducation | null {
  const link = item.querySelector('a[href*="/school/"], a[href*="/company/"]');
  const ls = lines(item).filter((l) => !EDUCATION_EXTRA.test(l));
  const school = ls[0];
  if (!school) return null;
  const dateIdx = ls.findIndex((l) => parseDateRange(l) !== null);
  const range = dateIdx >= 0 ? parseDateRange(ls[dateIdx] ?? "") : null;
  const degreeLine = dateIdx === 1 ? null : ls[1] ?? null;
  const comma = degreeLine?.indexOf(", ") ?? -1;
  return {
    school,
    schoolSlug: entityFromHref(link?.getAttribute("href"))?.slug ?? null,
    degree: degreeLine && comma > 0 ? degreeLine.slice(0, comma) : degreeLine,
    fieldOfStudy: degreeLine && comma > 0 ? degreeLine.slice(comma + 2) : null,
    start: range?.start ?? ABSENT,
    end: range?.end ?? ABSENT,
  };
}

export function parseEducation(doc: Doc, trace: Trace): Section<ParsedEducation> | undefined {
  const found = locate(doc, "EducationTopLevelSection", "education", trace);
  if (!found) return undefined;
  const items = outermost(found.container, '[componentkey^="entity-collection-item"]')
    .map(parseEducationItem)
    .filter((e): e is ParsedEducation => e !== null);
  return coverage(found, items, "education");
}

// ---- skills -----------------------------------------------------------------------------------

export function parseSkills(doc: Doc, trace: Trace): Section<string> | undefined {
  const found = locate(doc, "Skills", "skills", trace);
  if (!found) return undefined;
  const names = trace.first("skills.items", [
    ["skill-componentkey", () => {
      const els = Array.from(found.container.querySelectorAll('[componentkey^="com.linkedin.sdui.profile.skill("]')) as El[];
      return els.length ? els.map((el) => lineText(el.querySelector("p"))) : null;
    }],
    ["entity-item-first-line", () =>
      outermost(found.container, '[componentkey^="entity-collection-item"]').map((el) => lineText(el.querySelector("p")))],
  ]) ?? [];
  const items = [...new Set(names.filter((n): n is string => n !== null))];
  return coverage(found, items, "skills");
}
