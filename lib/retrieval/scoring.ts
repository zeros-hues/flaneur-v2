import { SCORING_CONFIG, type ScoringConfig } from "./scoring-config";
import type { Candidate, Evidence } from "./evidence";
import type { CompositeScoreBreakdown, RetrievalReason, SemanticCandidate } from "./semantic-types";

const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("en").trim();
const words = (text: string) => new Set(normalize(text).match(/[\p{L}\p{N}]+/gu) ?? []);

export interface ScoreCandidateParams {
  candidate: Candidate;
  terms: string[];
  semanticCandidate?: SemanticCandidate;
  config?: ScoringConfig;
}

/**
 * Computes an inspectable, normalized composite score for a candidate in Resurface mode.
 * 
 * Rules:
 * - Structured relationship filters (educated_at, employed_by, etc.) are NOT evaluated here;
 *   they are hard constraints applied before or during candidate qualification.
 * - Semantic relevance can bridge vocabulary, but weak matches below the floor are rejected.
 * - Single incidental lexical token overlap (e.g. just "interaction") cannot qualify alone.
 * - User-authored observations and notes provide an explicit salience multiplier.
 */
export function computeResurfaceScore({
  candidate,
  terms,
  semanticCandidate,
  config = SCORING_CONFIG,
}: ScoreCandidateParams): CompositeScoreBreakdown {
  const { weights, floors } = config;

  // 1. Lexical Component
  const activeEvidence = candidate.evidence.filter((e) => e.objectId === candidate.id && !e.filterOnly);
  const candidateWords = new Set(activeEvidence.flatMap((e) => [...words(e.text)]));
  const distinctQueryWords = [...new Set(terms.flatMap((t) => [...words(t)]))];
  
  const coveredCount = distinctQueryWords.filter((w) => candidateWords.has(w)).length;
  const lexicalCoverage = distinctQueryWords.length > 0 ? (coveredCount / distinctQueryWords.length) : 0;

  // 2. Semantic Component
  let rawSemantic = semanticCandidate?.score ?? candidate.semanticScore ?? 0;
  if (rawSemantic < floors.minSemanticFloor) {
    rawSemantic = 0;
  }

  // 3. User Salience Component
  const hasUserObservation = activeEvidence.some((e) => e.layer === "user" || e.id.startsWith("legacy-note:"));
  const userSalienceScore = hasUserObservation ? 1.0 : 0.0;

  // 4. Concept Boost Component
  const conceptMatches = semanticCandidate?.conceptMatches ?? candidate.semanticConceptMatches ?? [];
  const strongConcepts = conceptMatches.filter((c) => c.score >= floors.conceptMatchFloor);
  const bestConcept = strongConcepts.length > 0
    ? strongConcepts.reduce((prev, curr) => (curr.score > prev.score ? curr : prev))
    : null;
  const conceptScore = bestConcept ? bestConcept.score : 0;

  // Composite Calculation
  const semanticComponent = rawSemantic * weights.semantic;
  const lexicalComponent = lexicalCoverage * weights.lexical;
  const userSalienceComponent = userSalienceScore * weights.userSalience;
  const conceptComponent = conceptScore * weights.conceptBoost;

  const compositeScore = semanticComponent + lexicalComponent + userSalienceComponent + conceptComponent;

  // Qualification Gates:
  // - Must meet minQualificationScore
  // - If zero lexical coverage, must meet weakSemanticFloor
  // - If zero semantic score, must have high lexical coverage (cannot pass on weak 1-token mention)
  let qualifies = compositeScore >= floors.minQualificationScore;
  if (distinctQueryWords.length > 0 && lexicalCoverage === 0) {
    if (rawSemantic < floors.weakSemanticFloor && conceptScore < floors.conceptMatchFloor) {
      qualifies = false;
    }
  }
  if (rawSemantic === 0 && lexicalCoverage < 0.6) {
    // Pure lexical candidate in resurface mode must cover significant portion of query terms
    qualifies = false;
  }

  // Build inspectable retrieval reason
  const reason: RetrievalReason = {
    headline: "Relevant to your current context",
    score: Math.round(compositeScore * 100) / 100,
    semanticScore: rawSemantic > 0 ? Math.round(rawSemantic * 100) / 100 : undefined,
    lexicalScore: lexicalCoverage > 0 ? Math.round(lexicalCoverage * 100) / 100 : undefined,
    userSalienceBoost: hasUserObservation,
    conceptBridge: bestConcept?.label,
  };

  return {
    compositeScore,
    semanticComponent,
    lexicalComponent,
    userSalienceComponent,
    conceptComponent,
    qualifies,
    reason,
  };
}

export interface DiversifiedCandidate<T> {
  item: T;
  candidateId: string;
  authorId?: string;
  sourceDomain?: string;
  hasUserObservation: boolean;
}

/**
 * Deterministic diversity pass:
 * - Deduplicates identical target objects
 * - Suppresses near-identical artifacts from the same author or source domain once threshold reached
 * - Preserves deterministic tie-breaking by score and candidate ID
 */
export function applyDeterministicDiversity<T extends { candidate: Candidate; score: number }>(
  items: T[],
  config: ScoringConfig = SCORING_CONFIG,
): T[] {
  const result: T[] = [];
  const authorCounts = new Map<string, number>();
  const domainCounts = new Map<string, number>();
  const seenCandidateIds = new Set<string>();

  for (const item of items) {
    const candidate = item.candidate;
    if (seenCandidateIds.has(candidate.id)) continue;

    // Check author limit
    const authorId = candidate.authorId;
    if (authorId) {
      const currentAuthorCount = authorCounts.get(authorId) ?? 0;
      if (currentAuthorCount >= config.diversity.maxPerAuthorOrSource) {
        // Suppress unless it has a unique user observation
        const hasUserObservation = candidate.evidence.some((e) => e.layer === "user");
        if (!hasUserObservation) continue;
      }
    }

    // Check source domain limit
    const sourceDomain = candidate.sourceDomain;
    if (sourceDomain) {
      const currentDomainCount = domainCounts.get(sourceDomain) ?? 0;
      if (currentDomainCount >= config.diversity.maxPerAuthorOrSource) {
        const hasUserObservation = candidate.evidence.some((e) => e.layer === "user");
        if (!hasUserObservation) continue;
      }
    }

    seenCandidateIds.add(candidate.id);
    if (authorId) authorCounts.set(authorId, (authorCounts.get(authorId) ?? 0) + 1);
    if (sourceDomain) domainCounts.set(sourceDomain, (domainCounts.get(sourceDomain) ?? 0) + 1);
    result.push(item);

    if (result.length >= config.diversity.maxSurfacedMatches) break;
  }

  return result;
}
