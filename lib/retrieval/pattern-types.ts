/** Pure type contracts for Milestone C Reflect Pattern Discovery. */

export type PatternSupportKind =
  | "reviewed_fact"
  | "structured_fact"
  | "owner_authored_note"
  | "concept_relationship"
  | "source_evidence";

export interface PatternSupportItem {
  personId: string;
  personName: string;
  supportKind: PatternSupportKind;
  label: string;
  value: string;
  detail?: string;
  evidenceRef?: string;
  provenance?: Record<string, unknown>;
}

export interface DiscoveredPattern {
  id: string;
  patternType: "role_domain" | "organisation_community" | "user_attention_theme" | "reviewed_concept";
  headline: string;
  observationCopy: string;
  dimensionKey: string;
  dimensionValue: string;
  supportingPeopleCount: number;
  totalPopulation: number;
  supportingPeople: {
    personId: string;
    personName: string;
    headline?: string | null;
    signals: PatternSupportItem[];
  }[];
  specificityScore: number;
  compositeScore: number;
}

export interface PatternInputRole {
  id?: string;
  title: string;
  description?: string | null;
  classificationConfidence?: number | null;
  classificationProvenance?: string | null;
  legacyStatus?: 'legacy_unverified';
  domain?: string | null;
  organisationName?: string | null;
}

export interface PatternInputEducation {
  school?: string | null;
  degree?: string | null;
  fieldOfStudy?: string | null;
}

export interface PatternInputNote {
  id: string;
  body: string;
  targetKind: "person" | "artifact";
}

export interface PatternInputPerson {
  id: string;
  name: string;
  headline?: string | null;
  location?: string | null;
  roles: PatternInputRole[];
  education: PatternInputEducation[];
  notes: PatternInputNote[];
  reviewedConcepts?: { conceptId: string; conceptLabel: string; reason?: string; observationId?: string; relationshipId?: string }[];
  reviewedTrajectories?: { from: string; to: string }[];
}

export interface PatternDiscoveryInput {
  people: PatternInputPerson[];
  totalPopulation: number;
}
