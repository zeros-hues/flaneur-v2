import { computeResurfaceScore, applyDeterministicDiversity } from "./scoring";

/** Pure contracts only: callers supply evidence; this module never reads a database. */
export type TruthLayer = "user" | "source" | "extracted" | "inferred";
export interface Evidence {
  id: string;
  objectId: string;
  text: string;
  layer: TruthLayer;
  verified: boolean;
  /** Relationship context can satisfy its explicit filter, never a topical content term. */
  filterOnly?:boolean;
  provenance?: { observationId?: string; encounterId?: string; snapshotId?: string;
    legacyNoteId?: string;
    representationId?: string; startCodepoint?: number; endCodepoint?: number;
    sourceUrl?: string;
    supportStatus?: string; locatorEvidenceIds?: string[];
    trajectory?:{id:string;from:{id:string;label:string;kind:'concept'|'topic'};to:{id:string;label:string;kind:'concept'|'topic'};
     order:'unknown'|'ordered'|'reversed'|'overlapping_or_uncertain';chronology?:import('../relationships/trajectory').TrajectoryChronology;
     supportingObservationIds:string[];candidateId?:string};
    relationship?:{id:string;predicate:'educated_at'|'employed_by';organisationId:string;organisationLabel:string;fieldOfStudy?:string}|
     {id:string;predicate:'authored_by'|'profile_of';personId:string}|
     {id:string;predicate:'associated_with_concept';conceptId:string;conceptLabel:string;conceptKind:'concept'|'topic'} };
}
export interface Constraint { field: string; value: string }
/** Preserve exact code-point provenance when a display/context takes a smaller quote. */
export function evidenceSlice(item: Evidence, start: number, end: number): Evidence {
  const points = Array.from(item.text), text = points.slice(start, end).join("");
  const provenance = item.provenance;
  return { ...item, text, ...(provenance?.representationId && provenance.startCodepoint !== undefined ? {
    provenance: { ...provenance, startCodepoint: provenance.startCodepoint + start,
      endCodepoint: provenance.startCodepoint + start + Array.from(text).length },
  } : {}) };
}
export interface Fact extends Constraint { evidenceId: string }
export interface Candidate {
  id: string; evidence: Evidence[]; facts: Fact[];
  /** Only an authoritative reader can declare a multivalued field completely represented. */
  completeFields?: string[];
  encounters?: { occurredAt: string; evidenceId: string }[];
  semanticScore?: number;
  semanticConceptMatches?: import("./semantic-types").SemanticConceptMatch[];
  retrievalReason?: import("./semantic-types").RetrievalReason;
  authorId?: string;
  sourceDomain?: string;
}
export interface Request {
  mode: "recall" | "resurface" | "reflect";
  terms: string[];
  constraints: Constraint[];
  question?: string;
  objectKinds?: ("person" | "artifact" | "encounter")[];
  encounteredBetween?: { start: string; end: string };
  /** Reflection coverage describes a defined population, never a nearest-neighbour sample. */
  population?: { defined: boolean; total: number; indexed: number };
  semanticScorer?: import("./semantic-types").SemanticScorer;
}
const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("en").trim();
const words = (text: string) => new Set(normalize(text).match(/[\p{L}\p{N}]+/gu) ?? []);

export function retrieveEvidence(request: Request, candidates: Candidate[]) {
  const window = request.encounteredBetween;
  if (window && (!Number.isFinite(Date.parse(window.start)) || !Number.isFinite(Date.parse(window.end)) ||
      Date.parse(window.start) >= Date.parse(window.end))) throw new Error("INVALID_ENCOUNTER_WINDOW");
  const candidateIds = new Set<string>();
  const evidenceIds = new Set<string>();
  for (const candidate of candidates) {
    if (candidateIds.has(candidate.id)) throw new Error("DUPLICATE_CANDIDATE_ID");
    candidateIds.add(candidate.id);
    for (const item of candidate.evidence) {
      if (evidenceIds.has(item.id)) throw new Error("DUPLICATE_EVIDENCE_ID");
      evidenceIds.add(item.id);
    }
  }
  if (request.mode === "reflect" && (!request.population?.defined ||
      !Number.isInteger(request.population.total) || request.population.total < 1 ||
      request.population.indexed !== request.population.total || candidates.length !== request.population.indexed)) {
    return { state: "insufficient_population" as const, matches: [], uncertain: [], evaluated: 0 };
  }
  const terms = [...new Set(request.terms.flatMap((term) => [...words(term)]))];
  const ranked: { candidate: Candidate; score: number; uncertain: boolean; evidenceIds: string[] }[] = [];
  for (const candidate of candidates) {
    const byId = new Map(candidate.evidence.filter((e) => e.objectId === candidate.id).map((e) => [e.id, e]));
    let uncertain = false;
    let excluded = false;
    const datedEvidence: string[] = [];
    if (window) {
      for (const encounter of candidate.encounters ?? []) {
        const support = byId.get(encounter.evidenceId);
        const date = Date.parse(encounter.occurredAt);
        if (support?.verified && support.layer !== "inferred" && Number.isFinite(date) &&
            date >= Date.parse(window.start) && date < Date.parse(window.end)) datedEvidence.push(support.id);
      }
      if (!datedEvidence.length) {
        if (candidate.completeFields?.includes("encounter_date")) excluded = true;
        else uncertain = true;
      }
    }
    for (const constraint of request.constraints) {
      const facts = candidate.facts.filter((fact) => fact.field === constraint.field);
      const confirmed = facts.filter((fact) => {
        const evidence = byId.get(fact.evidenceId);
        return evidence?.verified && evidence.layer !== "inferred";
      });
      if (confirmed.some((fact) => normalize(fact.value) === normalize(constraint.value))) continue;
      if (candidate.completeFields?.includes(constraint.field)) { excluded = true; break; }
      uncertain = true;
    }
    if (excluded) continue;
    if (request.mode === "resurface") {
      const breakdown = computeResurfaceScore({
        candidate,
        terms: request.terms,
      });
      if (!breakdown.qualifies) continue;
      const relevant = [...byId.values()].filter((e) => !e.filterOnly);
      const evidenceIds = new Set<string>(datedEvidence);
      for (const e of relevant) {
        if (e.layer === "user" || e.id.startsWith("legacy-note:")) evidenceIds.add(e.id);
      }
      for (const e of relevant) {
        if (terms.some((term) => words(e.text).has(term))) evidenceIds.add(e.id);
      }
      if (!evidenceIds.size && relevant[0]) evidenceIds.add(relevant[0].id);
      for (const fact of candidate.facts) {
        if (request.constraints.some((c) => c.field === fact.field && normalize(c.value) === normalize(fact.value)) && byId.has(fact.evidenceId))
          evidenceIds.add(fact.evidenceId);
      }
      if (!evidenceIds.size) continue;
      candidate.retrievalReason = breakdown.reason;
      ranked.push({ candidate, score: breakdown.compositeScore, uncertain, evidenceIds: [...evidenceIds] });
    } else {
      // Conservative lexical baseline: every requested term must appear in this object's evidence.
      // No semantic score is accepted until a calibrated threshold is available.
      const relevant = [...byId.values()].filter((e) => !e.filterOnly&&terms.some((term) => words(e.text).has(term)));
      const covered = new Set(relevant.flatMap((e) => [...words(e.text)]));
      if (terms.some((term) => !covered.has(term))) continue;
      if (!terms.length && !request.constraints.length && !window) continue;
      const evidenceIds = new Set([...relevant.map((e) => e.id), ...datedEvidence]);
      for (const fact of candidate.facts) {
        if (request.constraints.some((c) => c.field === fact.field && normalize(c.value) === normalize(fact.value)) && byId.has(fact.evidenceId))
          evidenceIds.add(fact.evidenceId);
      }
      if (!evidenceIds.size) continue;
      const userRelevant = relevant.some((e) => e.layer === "user");
      ranked.push({ candidate, score: terms.length + (userRelevant ? 0.5 : 0), uncertain, evidenceIds: [...evidenceIds] });
    }
  }
  ranked.sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));
  let matches = ranked.filter((r) => !r.uncertain);
  let uncertain = ranked.filter((r) => r.uncertain);
  if (request.mode === "resurface") {
    matches = applyDeterministicDiversity(matches);
  }
  return { state: matches.length ? "matched" as const : uncertain.length ? "uncertain" as const : "no_match" as const,
    matches, uncertain, evaluated: candidates.length };
}

export interface Claim { text: string; layer: TruthLayer; evidenceIds: string[]; quote?: string }
/** Citation integrity is checked here; semantic entailment still requires separate verification. */
export function validateClaim(claim: Claim, evidence: Evidence[]): boolean {
  if (!claim.text.trim() || !claim.evidenceIds.length) return false;
  const cited = claim.evidenceIds.map((id) => evidence.find((e) => e.id === id));
  if (cited.some((e) => !e)) return false;
  if (claim.layer !== "inferred" && cited.some((e) => !e?.verified || e.layer !== claim.layer)) return false;
  if (claim.quote !== undefined && (!claim.quote.length || !cited.some((e) => e?.text.includes(claim.quote!)))) return false;
  return true;
}

/** Offsets use Unicode code points, so an emoji occupies one position. */
export function verifiedExcerpt(text: string, start: number, end: number, quote: string): boolean {
  const points = Array.from(text);
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start &&
    end <= points.length && points.slice(start, end).join("") === quote;
}
