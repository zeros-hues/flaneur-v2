import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const result = await build({ entryPoints: ["lib/retrieval/evidence.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { retrieveEvidence, validateClaim, verifiedExcerpt } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
const answerBundle = await build({ entryPoints: ["lib/retrieval/answer.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { answerContext, parseEvidenceAnswer } = await import(`data:text/javascript;base64,${Buffer.from(answerBundle.outputFiles[0].contents).toString("base64")}`);
const evidence = (id, objectId, text, layer = "extracted", verified = true) => ({ id, objectId, text, layer, verified });
const candidate = (id, text, school, layer = "extracted") => ({ id, completeFields: school ? ["school"] : [],
  evidence: [evidence(`${id}-text`, id, text, layer), evidence(`${id}-school`, id, school ?? "unknown")],
  facts: school ? [{ field: "school", value: school, evidenceId: `${id}-school` }] : [] });
const request = { mode: "recall", terms: ["robotics"], constraints: [] };

test("one saved person can satisfy Recall; absent topics abstain", () => {
  const people = [candidate("one", "robotics research")];
  assert.equal(retrieveEvidence(request, people).matches.length, 1);
  assert.equal(retrieveEvidence({ ...request, terms: ["astronomy"] }, people).state, "no_match");
});
test("EPFL and topic constraints share one candidate and evidence population", () => {
  const people = [candidate("match", "robotics", "EPFL"), candidate("wrong-school", "robotics", "MIT"),
    candidate("wrong-topic", "painting", "EPFL"), candidate("unknown-school", "robotics")];
  const result = retrieveEvidence({ ...request, constraints: [{ field: "school", value: "EPFL" }] }, people);
  assert.deepEqual(result.matches.map((r) => r.candidate.id), ["match"]);
  assert.deepEqual(result.uncertain.map((r) => r.candidate.id), ["unknown-school"]);
  assert.deepEqual(result.matches[0].evidenceIds, ["match-text", "match-school"]);
});
test("relevant User words outrank equally relevant inference without promoting irrelevant notes", () => {
  const result = retrieveEvidence(request, [candidate("a", "robotics", undefined, "inferred"),
    candidate("z", "robotics", undefined, "user"), candidate("irrelevant", "coffee", undefined, "user")]);
  assert.deepEqual(result.matches.map((r) => r.candidate.id), ["z", "a"]);
});
test("foreign evidence and inferred school assertions cannot confirm constraints", () => {
  const c = candidate("one", "robotics", "EPFL");
  c.evidence[1].layer = "inferred";
  c.completeFields = [];
  assert.equal(retrieveEvidence({ ...request, constraints: [{ field: "school", value: "EPFL" }] }, [c]).state, "uncertain");
  c.evidence[0].objectId = "another";
  assert.equal(retrieveEvidence(request, [c]).state, "no_match");
});

test("partial nonmatching education remains uncertain; only complete fields exclude", () => {
  const c = candidate("one", "robotics", "MIT");
  const constrained = { ...request, constraints: [{ field: "school", value: "EPFL" }] };
  assert.equal(retrieveEvidence(constrained, [c]).state, "no_match");
  c.completeFields = [];
  assert.equal(retrieveEvidence(constrained, [c]).state, "uncertain");
});
test("duplicate identities cannot inflate results or reflection coverage", () => {
  const c = candidate("one", "robotics");
  assert.throws(() => retrieveEvidence(request, [c, c]), /DUPLICATE_CANDIDATE/);
  assert.equal(retrieveEvidence({ ...request, mode: "reflect", population: { defined: true, total: 2, indexed: 2 } }, [c]).state, "insufficient_population");
});
test("Reflect rejects missing, partial and empty population coverage", () => {
  for (const population of [undefined, { defined: true, total: 2, indexed: 1 }, { defined: true, total: 0, indexed: 0 }])
    assert.equal(retrieveEvidence({ ...request, mode: "reflect", population }, []).state, "insufficient_population");
});
test("unknown citations and truth-layer laundering fail; inference stays inferred", () => {
  const docs = [evidence("e", "one", "generated robotics", "inferred")];
  assert.equal(validateClaim({ text: "robotics", layer: "inferred", evidenceIds: ["missing"] }, docs), false);
  assert.equal(validateClaim({ text: "robotics", layer: "source", evidenceIds: ["e"] }, docs), false);
  assert.equal(validateClaim({ text: "robotics", layer: "inferred", evidenceIds: ["e"] }, docs), true);
  assert.equal(validateClaim({ text: "robotics", layer: "inferred", evidenceIds: ["e"], quote: "invented" }, docs), false);
});
test("excerpt positions use Unicode code points and reject malformed ranges", () => {
  assert.equal(verifiedExcerpt("A😀B", 1, 2, "😀"), true);
  assert.equal(verifiedExcerpt("A😀B", 1, 3, "😀"), false);
  assert.equal(verifiedExcerpt("A😀B", -1, 2, "😀"), false);
  assert.equal(verifiedExcerpt("A😀B", 1.5, 2, "😀"), false);
});

test("answer context is bounded and rejects ambiguous evidence IDs", () => {
  const context = answerContext(Array.from({ length: 20 }, (_, i) => evidence(`e${i}`, "one", "😀".repeat(3000))));
  assert.equal(context.evidence.length, 12);
  assert.equal(Array.from(context.evidence[0].text).length, 2000);
  assert.throws(() => answerContext([evidence("same", "one", "a"), evidence("same", "two", "b")]), /DUPLICATE/);
});
test("structured answer rejects the entire reply when a claim uses hidden or unsupported evidence", () => {
  const context = answerContext([evidence("e", "one", "robotics")]);
  const valid = { text: "robotics", layer: "extracted", evidenceIds: ["e"], quote: "robotics" };
  assert.equal(parseEvidenceAnswer(JSON.stringify({ claims: [valid] }), context.evidence).state, "supported_ids");
  assert.equal(parseEvidenceAnswer(JSON.stringify({ claims: [valid, { ...valid, evidenceIds: ["hidden"] }] }), context.evidence).state, "invalid");
  assert.equal(parseEvidenceAnswer('{"claims":[],"extra":true}', context.evidence).state, "invalid");
  assert.equal(parseEvidenceAnswer('{"claims":[]}', context.evidence).state, "abstained");
});

test("provenance metadata cannot evade answer-context bounds", () => {
  const item = { ...evidence("e", "one", "robotics"), provenance: {
    observationId: "observation", locatorEvidenceIds: Array.from({ length: 1000 }, (_, i) => `locator-${i}`),
  } };
  const bounded = answerContext([item]).evidence[0].provenance;
  assert.equal(bounded.observationId, "observation");
  assert.equal(bounded.locatorEvidenceIds.length, 12);
  assert.equal(bounded.locatorEvidenceIds[0], "locator-0");
  assert.throws(() => answerContext([{ ...item, id: "x".repeat(201) }]), /INVALID_CONTEXT_ID/);
});
