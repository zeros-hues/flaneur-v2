import { parseDocument, type El } from "../parsers/dom";
import { locateUniqueQuote } from "./normalize";
import type { Representation } from "./representation";
import { migrationId } from "../migration/identity";
import { FIELD_EXTRACTOR_VERSION } from "../processing/parse-input";

export interface ExtractedField {
  observationId: string; evidenceId: string; subjectId: string;
  field: "school" | "role" | "organization"; value: string;
  start: number; end: number; quote: string; originKey: string;
}
/** Conservative new extraction; no legacy role/classification output is treated as ground truth. */
export function extractProfileFields(html: string, source: Representation, subjectId: string, inputFingerprint: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subjectId))
    throw new Error("INVALID_FIELD_SUBJECT");
  const document = parseDocument(html);
  const roots = Array.from(document.querySelectorAll('section[aria-label="Primary content"]'));
  if (roots.length !== 1) throw new Error("AMBIGUOUS_OR_MISSING_CAPTURE_ROOT");
  const root = roots[0]!;
  const fields: ExtractedField[] = [];
  const omitted: { field: string; code: "AMBIGUOUS_OR_MISSING_FIELD_QUOTE" | "AMBIGUOUS_FIELD_ELEMENT" }[] = [];
  const values = new Set<string>();
  function add(field: ExtractedField["field"], element: El | null) {
    if (!element || element.querySelector("script, style, template, [hidden], [aria-hidden='true']") ||
        element.closest('[hidden], [inert], [aria-hidden="true"]')) return;
    if (field !== "role" && element.querySelectorAll("p").length > 1) {
      omitted.push({ field, code: "AMBIGUOUS_FIELD_ELEMENT" }); return;
    }
    const value = (element.textContent ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!value || value.length > 1000 || values.has(`${field}:${value}`)) return;
    values.add(`${field}:${value}`);
    let locator;
    try { locator = locateUniqueQuote(source.text, value); }
    catch { omitted.push({ field, code: "AMBIGUOUS_OR_MISSING_FIELD_QUOTE" }); return; }
    const originKey = `capture-field:${JSON.stringify([source.snapshotId, source.normalizerVersion,
      FIELD_EXTRACTOR_VERSION, inputFingerprint, subjectId.toLowerCase(), field, locator.start, locator.end])}`;
    fields.push({ observationId: migrationId(`${originKey}:observation`), evidenceId: migrationId(`${originKey}:evidence`),
      subjectId: subjectId.toLowerCase(), field, value, ...locator, originKey });
  }
  // Only explicit school links inside the education section, never the topcard or recommendations.
  for (const section of Array.from(root.querySelectorAll('[componentkey$="EducationTopLevelSection"], [data-testid^="profile_EducationTopLevelSection_"]'))) {
    for (const link of Array.from(section.querySelectorAll('a[href*="/school/"]'))) add("school", link);
  }
  // Grouped roles are deliberately omitted until row-specific attribution is implemented.
  for (const section of Array.from(root.querySelectorAll('[componentkey$="ExperienceTopLevelSection"], [componentkey$="ExperienceDetailsSection"]'))) {
    for (const item of Array.from(section.querySelectorAll('[componentkey^="entity-collection-item"]'))) {
      if (item.querySelector("ul")) continue;
      const title = item.querySelector("p");
      if (!title?.closest('a[href*="/company/"]')) add("role", title);
      add("organization", item.querySelector('a[href*="/company/"]'));
    }
  }
  return { fields, omitted };
}
