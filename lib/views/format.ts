// Display formatting shared by the dashboard pages.
type Precision = "month" | "year" | "absent";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A stored date at its captured precision: "Mar 2021", "2021", or null when absent. */
export function formatPartialDate(date: string | null, precision: Precision): string | null {
  if (!date || precision === "absent") return null;
  const year = date.slice(0, 4);
  if (precision === "year") return year;
  const month = MONTHS[Number(date.slice(5, 7)) - 1];
  return month ? `${month} ${year}` : year;
}

export function formatRange(
  start: string | null,
  startPrecision: Precision,
  end: string | null,
  endPrecision: Precision,
  current = false,
): string | null {
  const from = formatPartialDate(start, startPrecision);
  const to = current ? "present" : formatPartialDate(end, endPrecision);
  if (!from && !to) return null;
  return `${from ?? "?"} – ${to ?? "?"}`;
}

export function formatDay(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** First `max` characters on a word boundary, with an ellipsis when cut. */
export function snippet(text: string | null, max: number): string | null {
  const flat = text?.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
