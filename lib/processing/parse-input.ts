import { inputFingerprint } from "./fingerprint";

export const TEXT_NORMALIZER_VERSION = "linkedin-captured-text-v1";
export const WEB_NORMALIZER_VERSION = 'web-captured-text-v1';
export const captureKind = (adapterId: string, captureType: string): 'profile_page' | 'social_post' | 'article' =>
  adapterId === 'web' ? 'article' : captureType === 'profile' ? 'profile_page' : 'social_post';
export const normalizerVersion = (kind: string) => kind === 'article' ? WEB_NORMALIZER_VERSION : TEXT_NORMALIZER_VERSION;
export const FIELD_EXTRACTOR_VERSION = "linkedin-field-evidence-v1";
export function parseFingerprint(input: { contentHash: string; sourceUrl: string;
  kind: "profile_page" | "social_post" | "article"; adapterId: string; identityObservationId?: string | null }) {
  return inputFingerprint({ contentHash: input.contentHash, sourceUrl: input.sourceUrl,
    kind: input.kind, adapterId: input.adapterId, identityObservationId: input.identityObservationId ?? null },
  { parser: `${FIELD_EXTRACTOR_VERSION}:${normalizerVersion(input.kind)}` });
}
