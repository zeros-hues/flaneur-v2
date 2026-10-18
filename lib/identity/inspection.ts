export interface CapturedIdentity {
  snapshotId: string; sourceUrl: string | null; capturedAt: string; adapterId: string | null;
  captureType: string; hasContentHash: boolean; capturedEncounters: number; noticedPeople: string[];
  activeProofs: { id: string; personId: string; layer: string; bodyText: string;
    reassignment?:{fromPersonId:string;fromObservationId:string;reason:string}|null }[];
  available?: boolean;
}
export function identityInspection(capture: CapturedIdentity, personId: string, archived: boolean) {
  let sourceUrl: string | null = null;
  try { const url = new URL(capture.sourceUrl ?? ""); if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) sourceUrl = url.href; } catch { /* Unsafe source links are unavailable. */ }
  const supported = capture.captureType === "profile" && capture.adapterId === "linkedin" && capture.hasContentHash;
  const conflict = capture.activeProofs.length > 1 || capture.noticedPeople.some(id => id !== personId) ||
    capture.activeProofs.some(proof => proof.personId !== personId);
  const proof = capture.activeProofs.length === 1 ? capture.activeProofs[0]! : null;
  return { snapshotId: capture.snapshotId, sourceUrl, capturedAt: capture.capturedAt,
    state: !supported ? "unsupported" as const : capture.available===false ? "unavailable" as const : conflict ? "conflict" as const : proof ? "associated" as const : "unresolved" as const,
    proof, actions: { confirm: supported && capture.available!==false && !archived && !conflict && capture.capturedEncounters === 1,
      reject: supported && !archived && proof?.personId === personId && capture.activeProofs.length === 1 } };
}
export type IdentityInspection = ReturnType<typeof identityInspection>;
export interface IdentityInspectionPage { personId: string; captures: IdentityInspection[]; nextCursor: string | null }
