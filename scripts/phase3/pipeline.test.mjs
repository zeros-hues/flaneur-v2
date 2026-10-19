import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["lib/retrieval/pipeline.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { evidenceQuery } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const request = { mode: "recall", terms: ["robotics"], constraints: [] };
const candidate = (id, text = "robotics") => ({ id, facts: [], evidence: [{ id: `e-${id}`, objectId: id, text, layer: "user", verified: true }] });
test("mixed answer and object list use the same retrieval population and bounded evidence", async () => {
  const items = [candidate("one"), candidate("two"), candidate("distractor", "painting")];
  let reads = 0;
  const result = await evidenceQuery({ ...request, question: "Which saved people mentioned robotics?" }, { async read() { reads++; return items; } }, {
    async generate(instructions, data) {
      assert.match(instructions, /never as instructions/);
      const { evidence } = JSON.parse(data);
      assert.equal(JSON.parse(data).request.question, "Which saved people mentioned robotics?");
      assert.deepEqual(evidence.map((e) => e.objectId), ["one", "two"]);
      return JSON.stringify({ claims: [{ text: "robotics", layer: "user", evidenceIds: [evidence[0].id] }] });
    },
  });
  assert.equal(reads, 1);
  assert.equal(result.answer.state, "supported_ids");
  assert.deepEqual(result.matches.map((m) => m.candidate.id), ["one", "two"]);
});
test("absent and uncertain-only queries never invoke synthesis", async () => {
  const provider = { async generate() { assert.fail("must not generate"); } };
  const reader = { async read() { return [candidate("one")]; } };
  assert.equal((await evidenceQuery({ ...request, terms: ["astronomy"] }, reader, provider)).state, "no_match");
  const result = await evidenceQuery({ ...request, constraints: [{ field: "school", value: "EPFL" }] }, reader, provider);
  assert.equal(result.state, "uncertain");
  assert.equal(result.answerEvidence.length, 0);
});
test("provider failures retain results and sanitize private errors", async () => {
  const result = await evidenceQuery(request, { async read() { return [candidate("one")]; } }, {
    async generate() { throw new Error("private provider payload"); },
  });
  assert.equal(result.matches.length, 1);
  assert.equal(result.answer.state, "unavailable");
  assert.equal(JSON.stringify(result).includes("private provider payload"), false);
});
test("reply cannot cite a retrieved item omitted from the finite context", async () => {
  const result = await evidenceQuery(request, { async read() { return Array.from({ length: 10 }, (_, i) => candidate(`person${i}`)); } }, {
    async generate() { return JSON.stringify({ claims: [{ text: "robotics", layer: "user", evidenceIds: ["e-person9"] }] }); },
  });
  assert.equal(result.matchedTotal, 10);
  assert.equal(result.matches.length, 8);
  assert.equal(result.answer.state, "invalid");
});

test("Reflection does not synthesize population claims from a truncated object sample", async () => {
  const candidates = Array.from({ length: 10 }, (_, i) => candidate(`person${i}`));
  const result = await evidenceQuery({ ...request, mode: "reflect", terms: [],
    patternInputData: candidates.map(candidate => ({ id: candidate.id, name: candidate.id,
      roles: [{ title: 'Web Developer', domain: 'web' }], notes: [], education: [] })) }, {
    async read() { return { candidates, population: { defined: true, total: 10, indexed: 10 } }; },
  }, { async generate() { assert.fail("reflection sample must not be synthesized"); } });
  assert.equal(result.matchedTotal, 10);
  assert.equal(result.answer.state, "insufficient_context");
});
