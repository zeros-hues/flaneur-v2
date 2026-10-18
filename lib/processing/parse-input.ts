import { inputFingerprint } from "./fingerprint";

export const TEXT_NORMALIZER_VERSION = "linkedin-captured-text-v1";
export const FIELD_EXTRACTOR_VERSION = "linkedin-field-evidence-v1";
export function parseFingerprint(input: { contentHash: string; sourceUrl: string;
  kind: "profile_page" | "social_post"; adapterId: string; identityObservationId?: string | null }) {
  return inputFingerprint({ contentHash: input.contentHash, sourceUrl: input.sourceUrl,
    kind: input.kind, adapterId: input.adapterId, identityObservationId: input.identityObservationId ?? null },
  { parser: `${FIELD_EXTRACTOR_VERSION}:${TEXT_NORMALIZER_VERSION}` });
}
