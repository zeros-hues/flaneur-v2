// Historical URLs/URNs are resolution candidates, not proof that earlier merges were correct.
export function sourceCandidates(rows: { objectId: string; kind: "person" | "artifact";
  url: string; urn?: string | null }[]) {
  const candidates = rows.map((row) => {
    let adapterId = "legacy_unknown";
    try {
      const hostname = new URL(row.url).hostname.toLowerCase();
      if (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) adapterId = "linkedin";
    } catch { /* Retain malformed historical source rather than inventing a corrected URL. */ }
    return { objectId: row.objectId, adapterId,
      identityKind: row.kind === "person" ? "profile_url" : row.urn ? "artifact_urn" : "artifact_url",
      externalKey: row.kind === "artifact" && row.urn ? row.urn : row.url,
      canonicalUrl: row.url, needsEvidenceReview: true };
  }).sort((a, b) => a.objectId.localeCompare(b.objectId));
  const byKey = new Map<string, Set<string>>();
  for (const c of candidates) {
    const key = JSON.stringify([c.adapterId, c.identityKind, c.externalKey]);
    const ids = byKey.get(key) ?? new Set<string>(); ids.add(c.objectId); byKey.set(key, ids);
  }
  return { candidates, conflictingKeys: [...byKey.values()].filter((ids) => ids.size > 1).length };
}
