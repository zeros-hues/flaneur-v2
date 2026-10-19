/**
 * Centralized, inspectable, and calibratable scoring configuration for Flaneur V2 Resurface.
 * 
 * RATIONALE FOR SIGNALS:
 * 1. semantic: Primary signal in Resurface. Enables vocabulary bridging (e.g. 3D interaction <-> WebGL/three.js)
 *    derived from pgvector cosine similarity against stored 768-dim embeddings.
 * 2. lexical: Proportion of query terms directly appearing in candidate evidence text.
 *    Acts as a confidence anchor; prevents purely hallucinated semantic matches.
 * 3. userSalience: Priority multiplier for memories where the user explicitly authored a note, observation,
 *    or reason for noticing. Flaneur prioritizes intentional user attention over passive captures.
 * 4. conceptBoost: Extra weight when an artifact or person is connected via an adjacent Concept.
 */

export interface ScoringWeights {
  semantic: number;
  lexical: number;
  userSalience: number;
  conceptBoost: number;
}

export interface ScoringFloors {
  /** Raw cosine similarity below this floor is treated as noise. */
  minSemanticFloor: number;
  /** Concepts have compressed cosine distances in label space; only matches >= this floor count. */
  conceptMatchFloor: number;
  /** Composite score required for a candidate to be considered a confirmed match. */
  minQualificationScore: number;
  /** Higher semantic floor required when candidate has zero lexical term overlap. */
  weakSemanticFloor: number;
  /** Single-token lexical match threshold below which isolated token hits cannot qualify alone. */
  weakLexicalFloor: number;
}

export interface DiversityConfig {
  /** Maximum number of artifacts from the same author or source domain in top results. */
  maxPerAuthorOrSource: number;
  /** Maximum number of surfaced matches. */
  maxSurfacedMatches: number;
}

export interface ScoringConfig {
  weights: ScoringWeights;
  floors: ScoringFloors;
  diversity: DiversityConfig;
}

export const SCORING_CONFIG: ScoringConfig = {
  weights: {
    semantic: 0.60,
    lexical: 0.25,
    userSalience: 0.15,
    conceptBoost: 0.10,
  },
  floors: {
    minSemanticFloor: 0.50,
    conceptMatchFloor: 0.80,
    minQualificationScore: 0.40,
    weakSemanticFloor: 0.65,
    weakLexicalFloor: 0.15,
  },
  diversity: {
    maxPerAuthorOrSource: 2,
    maxSurfacedMatches: 8,
  },
};
