import { answerContext, EVIDENCE_INSTRUCTIONS, parseEvidenceAnswer } from "./answer";
import { retrieveEvidence, type Candidate, type Evidence, type Request } from "./evidence";

export interface RetrievalReader {
  /** Return the whole declared query population, not a silently capped nearest-neighbour subset. */
  read(request: Request): Promise<Candidate[] | { candidates: Candidate[]; population: NonNullable<Request["population"]> }>;
}
export interface AnswerProvider {
  generate(instructions: string, data: string): Promise<string>;
}

/** Prepared orchestration; no database or provider client is imported or configured. */
export async function evidenceQuery(request: Request, reader: RetrievalReader, provider?: AnswerProvider) {
  const read = await reader.read(request);
  const candidates = Array.isArray(read) ? read : read.candidates;
  const effective = Array.isArray(read) ? request : { ...request, population: read.population };
  const retrieval = retrieveEvidence(effective, candidates);
  const matches = retrieval.matches.slice(0, 8);
  const uncertain = retrieval.uncertain.slice(0, 8);
  // Interleave supporting evidence so one object cannot consume the entire context budget.
  const support = matches.map((match) => match.evidenceIds.map((id) =>
    match.candidate.evidence.find((e) => e.id === id)!));
  const evidence: Evidence[] = [];
  for (let i = 0; support.some((items) => i < items.length); i++) {
    for (const items of support) if (items[i]) evidence.push(items[i]!);
  }
  const context = answerContext(evidence);
  const base = {
    state: retrieval.state, matches, uncertain, evaluated: retrieval.evaluated,
    matchedTotal: retrieval.matches.length, uncertainTotal: retrieval.uncertain.length,
    answerEvidence: context.evidence,
    ...((retrieval as any).patterns ? { patterns: (retrieval as any).patterns } : {}),
  };
  // Uncertain results remain inspectable but never silently become confirmed answer support.
  if (!matches.length || !provider)
    return { ...base, answer: { state: "not_generated" as const, claims: [] } };
  if (request.mode === "reflect" && (retrieval.matches.length !== matches.length || evidence.length !== context.evidence.length))
    return { ...base, answer: { state: "insufficient_context" as const, claims: [] } };
  try {
    const reply = await provider.generate(EVIDENCE_INSTRUCTIONS, JSON.stringify({
      request: { question: request.question ?? null, mode: request.mode, terms: request.terms,
        constraints: request.constraints, objectKinds: request.objectKinds ?? null,
        encounteredBetween: request.encounteredBetween ?? null },
      evidence: context.evidence,
    }));
    return { ...base, answer: parseEvidenceAnswer(reply, context.evidence) };
  } catch {
    // A provider failure must not remove successfully retrieved objects or leak private errors.
    return { ...base, answer: { state: "unavailable" as const, claims: [] } };
  }
}
