import { verifiedExcerpt } from "../retrieval/evidence";
export interface InspectionEvidence {
  id: string; role: string; snapshotId: string | null; supportingObservationId: string | null;
  sourceUrl: string | null; excerpt: string | null; text: string | null; quote: string | null;
  start: number | null; end: number | null; representationSnapshotId: string | null;
}
export interface InspectionObservation {
  id: string; bodyText: string; layer: string; semanticRole: string; supportStatus: string;
  recordedAt: string; supersedesId: string | null; active: boolean; identityProof: boolean;
  relationshipReview?:boolean;
  evidence: InspectionEvidence[];
  reviews: { decision: string; comment: string | null; replacementId: string | null; reviewedAt: string }[];
}
export function inspectionView(row: InspectionObservation) {
  const revisable = row.active && !row.identityProof && !row.relationshipReview;
  return { ...row, evidence: row.evidence.map(({ text, start, end, representationSnapshotId, ...item }) => {
    let sourceUrl: string | null = null;
    try { const url = new URL(item.sourceUrl ?? ""); if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) sourceUrl = url.href; } catch { /* Unsafe links remain unavailable. */ }
    return { ...item, sourceUrl, quoteVerified: item.snapshotId !== null && item.snapshotId === representationSnapshotId &&
      text !== null && start !== null && end !== null && item.quote !== null && verifiedExcerpt(text, start, end, item.quote) };
  }), actions: {
    confirm: revisable && row.layer !== "user" && !!row.bodyText.trim() && row.bodyText.length <= 20000 &&
      !row.bodyText.includes("\0") && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(row.bodyText),
    correct: revisable, reject: revisable && row.layer !== "user", archive: revisable,
  } };
}
export type InspectedObservation = ReturnType<typeof inspectionView>;
export interface InspectionPage { personId: string; archived: boolean; observations: InspectedObservation[]; nextCursor: string | null }
