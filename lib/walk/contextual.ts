import type { Evidence } from "../retrieval/evidence";

export interface ContextualCandidate {
  id: string; kind: "person" | "artifact"; label: string;
  savedAt: string; lastEncounterAt: string | null; encounterCount: number;
  evidence: Evidence[];
}
export interface WalkFeedback {
  objectId: string; dismissals: number; lastExposedAt: string | null;
}
export interface ContextualStop extends ContextualCandidate {
  reasons: { code: "earlier" | "user_words" | "repeated" | "context"; text: string }[];
  selectionSupport: Evidence[];
}
const tokens = (text: string) => new Set(text.normalize("NFKC").toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) ?? []);
const DAY = 86400000;

/** Proposed, transparent heuristic. No due dates, schedule intervals, or provider calls. */
export function composeContextualWalk(candidates: ContextualCandidate[], input: {
  referenceInstant: string; context?: string; feedback?: WalkFeedback[];
}): ContextualStop[] {
  const now = Date.parse(input.referenceInstant);
  if (!Number.isFinite(now) || (input.context?.length ?? 0) > 2000 || candidates.length > 5000)
    throw new Error("INVALID_WALK_INPUT");
  const feedback = new Map<string, WalkFeedback>();
  for (const item of input.feedback ?? []) {
    if (feedback.has(item.objectId) || !Number.isSafeInteger(item.dismissals) || item.dismissals < 0 ||
        (item.lastExposedAt !== null && !Number.isFinite(Date.parse(item.lastExposedAt))))
      throw new Error("INVALID_WALK_FEEDBACK");
    feedback.set(item.objectId, item);
  }
  const context = tokens(input.context ?? ""), seen = new Set<string>();
  const pool = candidates.flatMap(candidate => {
    if (seen.has(candidate.id)) throw new Error("DUPLICATE_WALK_OBJECT");
    seen.add(candidate.id);
    const saved = Date.parse(candidate.savedAt), latest = candidate.lastEncounterAt === null ? saved : Date.parse(candidate.lastEncounterAt);
    if (!Number.isFinite(saved) || !Number.isFinite(latest) || !Number.isSafeInteger(candidate.encounterCount) || candidate.encounterCount < 0)
      throw new Error("INVALID_WALK_CANDIDATE");
    const prior = feedback.get(candidate.id);
    // A recent exposure rests for seven days; three explicit dismissals suppress indefinitely.
    if ((prior?.dismissals ?? 0) >= 3 || (prior?.lastExposedAt && now - Date.parse(prior.lastExposedAt) < 7 * DAY)) return [];
    const evidence = candidate.evidence.filter(item => item.objectId === candidate.id && item.text.trim() && !item.provenance?.encounterId);
    if (!evidence.length) return [];
    const words = tokens(evidence.map(item => item.text).join("\n"));
    const matched = [...context].filter(word => words.has(word));
    const age = Math.max(0, (now - Math.max(saved, latest)) / DAY);
    const user = evidence.some(item => item.layer === "user");
    const score = 0.3 * age / (age + 30) + (user ? 0.35 : 0) +
      0.15 * Math.min(candidate.encounterCount, 3) / 3 + 0.4 * matched.length / Math.max(1, context.size);
    const reasons: ContextualStop["reasons"] = [];
    if (age >= 30) reasons.push({ code: "earlier", text: "From earlier saved material" });
    if (user) reasons.push({ code: "user_words", text: "Includes your saved words" });
    if (candidate.encounterCount >= 2) reasons.push({ code: "repeated", text: "Appears in multiple recorded encounters" });
    if (matched.length) reasons.push({ code: "context", text: "Saved words overlap with your current context" });
    // Age alone never creates an obligation to revisit low-salience material.
    if (score / (1 + (prior?.dismissals ?? 0)) < 0.3) return [];
    const support = [evidence.find(item => item.layer === "user"),
      evidence.find(item => [...tokens(item.text)].some(word => context.has(word))), evidence[0],
      ...candidate.evidence.filter(item => item.provenance?.encounterId).slice(0, 2)]
      .filter((item): item is Evidence => item !== undefined);
    return [{ candidate: { ...candidate, evidence }, words, score: score / (1 + (prior?.dismissals ?? 0)), reasons,
      selectionSupport: [...new Map(support.map(item => [item.id, item])).values()] }];
  });
  const chosen: typeof pool = [];
  while (chosen.length < 3 && pool.length) {
    const rank = (item: typeof pool[number]) => item.score - Math.max(0, ...chosen.map(other => {
      const common = [...item.words].filter(word => other.words.has(word)).length;
      return 0.3 * common / Math.max(1, new Set([...item.words, ...other.words]).size);
    }));
    pool.sort((a, b) => rank(b) - rank(a) || a.candidate.id.localeCompare(b.candidate.id));
    chosen.push(pool.shift()!);
  }
  return chosen.map(item => ({ ...item.candidate, reasons: item.reasons, selectionSupport: item.selectionSupport }));
}
