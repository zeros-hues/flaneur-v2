import { z } from "zod";
import { MODES } from "@/lib/enrich/prompts";

// Accepts YYYY, YYYY-MM or YYYY-MM-DD and normalises to a full date (first day of the period).
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "date must be YYYY, YYYY-MM or YYYY-MM-DD")
  .transform((d) => (d.length === 4 ? `${d}-01-01` : d.length === 7 ? `${d}-01` : d));

const domain = z.string().trim().toLowerCase().min(1).max(60);

// Nullish so the same schema reads both the router's strict output (nulls) and a client's
// corrected routed_json (omitted fields). Normalised to omitted fields by `normaliseRouted`.
export const routedQuery = z.object({
  kind: z.enum(["semantic", "structural", "hybrid"]),
  semantic_text: z.string().trim().max(1000).nullish(),
  filters: z
    .object({
      domain_from: domain.nullish(),
      domain_to: domain.nullish(),
      domain_any: z.array(domain).max(20).nullish(),
      mode: z.array(z.enum(MODES)).max(MODES.length).nullish(),
      active_before: isoDate.nullish(),
      active_after: isoDate.nullish(),
    })
    .default({}),
  interpretation: z.string().trim().max(1000),
});
export type RoutedInput = z.input<typeof routedQuery>;

export interface Filters {
  domain_from?: string;
  domain_to?: string;
  domain_any?: string[];
  mode?: (typeof MODES)[number][];
  active_before?: string;
  active_after?: string;
}

export interface RoutedQuery {
  kind: "semantic" | "structural" | "hybrid";
  semantic_text: string | null;
  filters: Filters;
  interpretation: string;
}

/**
 * Drops empty values, then sets `kind` from what is actually present, so a router or client
 * that says "hybrid" without semantic text still runs as structural. Returns null when
 * nothing usable remains (no text and no filters).
 */
export function normaliseRouted(raw: z.output<typeof routedQuery>): RoutedQuery | null {
  const f = raw.filters;
  const filters: Filters = {};
  if (f.domain_from) filters.domain_from = f.domain_from;
  if (f.domain_to) filters.domain_to = f.domain_to;
  if (f.domain_any?.length) filters.domain_any = [...new Set(f.domain_any)];
  if (f.mode?.length) filters.mode = [...new Set(f.mode)];
  if (f.active_before) filters.active_before = f.active_before;
  if (f.active_after) filters.active_after = f.active_after;

  const text = raw.semantic_text?.trim() || null;
  const structural = Object.keys(filters).length > 0;
  if (!text && !structural) return null;
  const kind = text && structural ? "hybrid" : text ? "semantic" : "structural";
  return { kind, semantic_text: text, filters, interpretation: raw.interpretation };
}

export interface Coverage {
  matched: number;
  searched_over: number;
  unenriched: number;
  incomplete_timelines: number;
}

export type EmptyReason = "no_match" | "insufficient_data" | "parse_error";

export interface SearchHit {
  person_id: string;
  name: string;
  headline: string | null;
  profile_url: string;
  synthesis: string | null;
  /** Cosine similarity for semantic and hybrid searches; null for structural. */
  score: number | null;
}

export interface SearchResult {
  interpretation: string | null;
  routed_json: RoutedQuery | null;
  results: SearchHit[];
  coverage: Coverage;
  empty_reason: EmptyReason | null;
}
