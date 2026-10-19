/**
 * Types for semantic candidate generation, ephemeral retrieval reasons, and calibratable scoring.
 * 
 * IMPORTANT CONSTRAINTS:
 * - Semantic relevance is an ephemeral retrieval judgment only.
 * - It must NEVER be recorded as a graph fact, explicit relationship, or observation.
 * - Provenance (where data came from) and Retrieval Reason (why it appeared now) are strictly distinct.
 */

export interface SemanticConceptMatch {
  conceptId: string;
  label: string;
  score: number;
}

export interface SemanticCandidate {
  id: string;
  score: number;
  kind: "artifact" | "person" | "concept";
  source: "artifact_embedding" | "profile_embedding" | "concept_bridge";
  conceptMatches?: SemanticConceptMatch[];
  authorId?: string | null;
  sourceDomain?: string | null;
}

export interface RetrievalReason {
  headline: string;
  score?: number;
  semanticScore?: number;
  lexicalScore?: number;
  userSalienceBoost?: boolean;
  conceptBridge?: string;
  details?: string;
}

export interface CompositeScoreBreakdown {
  compositeScore: number;
  semanticComponent: number;
  lexicalComponent: number;
  userSalienceComponent: number;
  conceptComponent: number;
  qualifies: boolean;
  reason: RetrievalReason;
}

export interface SemanticScorer {
  /** Given a query question or terms, return bounded top-k semantic candidate hits. */
  scoreCandidates(query: string, candidateIds?: string[]): Promise<SemanticCandidate[]>;
}
