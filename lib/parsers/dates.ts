import type { ParsedDate } from "./types";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export const ABSENT: ParsedDate = { value: null, precision: "absent", invalidRaw: null };

const pad = (n: number) => String(n).padStart(2, "0");
const validYear = (y: number) => y >= 1900 && y <= 2100;

/** "May 2025" → month precision, "2025" → year precision. Never invents a month. */
export function parseDatePoint(raw: string): ParsedDate {
  const text = raw.trim();
  const monthYear = /^([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(text);
  if (monthYear?.[1] && monthYear[2]) {
    const month = MONTHS.indexOf(monthYear[1].slice(0, 3).toLowerCase()) + 1;
    const year = Number(monthYear[2]);
    if (month > 0 && validYear(year)) {
      return { value: `${year}-${pad(month)}-01`, precision: "month", invalidRaw: null };
    }
  }
  const yearOnly = /^(\d{4})$/.exec(text);
  if (yearOnly?.[1] && validYear(Number(yearOnly[1]))) {
    return { value: `${yearOnly[1]}-01-01`, precision: "year", invalidRaw: null };
  }
  return { value: null, precision: "absent", invalidRaw: text };
}

export interface ParsedRange {
  start: ParsedDate;
  end: ParsedDate;
  isCurrent: boolean;
}

const RANGE_SPLIT = /\s+[-–—]\s+/;

/** "May 2025 - Present · 1 yr 5 mos" → range. Returns null when the line is not a date line. */
export function parseDateRange(line: string): ParsedRange | null {
  const rangePart = line.split(" · ")[0]?.trim() ?? "";
  const [from, to, ...rest] = rangePart.split(RANGE_SPLIT);
  if (!from || rest.length > 0) return null;

  const start = parseDatePoint(from);
  if (start.precision === "absent") return null; // not a date line at all

  if (to === undefined) return { start, end: ABSENT, isCurrent: false };
  if (/^present$/i.test(to.trim())) return { start, end: ABSENT, isCurrent: true };
  return { start, end: parseDatePoint(to), isCurrent: false };
}

/** Precision rank, for "prefer the richer value" in merge. */
export function precisionRank(p: ParsedDate["precision"]): number {
  return p === "month" ? 2 : p === "year" ? 1 : 0;
}
