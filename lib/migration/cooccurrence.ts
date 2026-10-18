// Rebuild from distinct active artifact/concept links, never from assertion/capture counts.
export function cooccurrence(links: { artifactId: string; conceptId: string; active: boolean }[]) {
  const byArtifact = new Map<string, Set<string>>();
  for (const l of links) {
    if (!l.active) continue;
    const concepts = byArtifact.get(l.artifactId) ?? new Set<string>();
    concepts.add(l.conceptId); byArtifact.set(l.artifactId, concepts);
  }
  const frequencies = new Map<string, number>(); const pairs = new Map<string, number>();
  for (const concepts of byArtifact.values()) {
    const sorted = [...concepts].sort();
    sorted.forEach((id) => frequencies.set(id, (frequencies.get(id) ?? 0) + 1));
    sorted.forEach((a, i) => sorted.slice(i + 1).forEach((b) => {
      const key = JSON.stringify([a, b]); pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }));
  }
  return { frequencies: [...frequencies].sort(([a], [b]) => a.localeCompare(b))
    .map(([conceptId, count]) => ({ conceptId, count })),
  pairs: [...pairs].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => {
    const [conceptAId, conceptBId] = JSON.parse(key) as [string, string];
    return { conceptAId, conceptBId, count };
  }) };
}
