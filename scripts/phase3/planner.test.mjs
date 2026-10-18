import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
async function load(path) {
  const bundle = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
}
const { parsePlan, planQuery } = await load("lib/retrieval/planner.ts");
const { retrieveEvidence } = await load("lib/retrieval/evidence.ts");
const { plannedQuery } = await load("lib/retrieval/planned-query.ts");
const plan = { mode: "recall", terms: ["robotics"], constraints: [{ field: "school", value: "EPFL" }],
  encounteredBetween: null, ambiguities: [], interpretation: "Robotics and EPFL" };
test("planner preserves question and explicit constraints without fabricating counts", () => {
  const result = parsePlan(JSON.stringify(plan), "Who from EPFL works on robotics?");
  assert.equal(result.state, "planned"); assert.equal(result.request.question, "Who from EPFL works on robotics?");
  assert.deepEqual(result.request.constraints, plan.constraints);
  assert.equal(result.request.population, undefined);
  assert.equal(parsePlan(JSON.stringify({ ...plan, population: { total: 10 } }), "q").state, "invalid");
});

test("explicit people scope is retained without mixing artifacts into population counts", () => {
  const result = parsePlan(JSON.stringify({ ...plan, objectKinds: ["person"] }), "Which people?");
  assert.deepEqual(result.request.objectKinds, ["person"]);
  assert.equal(parsePlan(JSON.stringify({ ...plan, objectKinds: ["invented"] }), "q").state, "invalid");
});
test("ambiguous identity/date and unsupported filters never become executable plans", () => {
  const result = parsePlan(JSON.stringify({ ...plan, ambiguities: ["Which Cambridge?"] }), "q");
  assert.equal(result.state, "clarification"); assert.equal(result.request, undefined);
  assert.equal(parsePlan(JSON.stringify({ ...plan, constraints: [{ field: "guessed_field", value: "x" }] }), "q").state, "invalid");
  assert.equal(parsePlan("not JSON", "q").state, "invalid");
});
test("invalid or reversed dates are rejected; vague unbounded plans require clarification", () => {
  assert.equal(parsePlan(JSON.stringify({ ...plan, encounteredBetween: { start: "2025-01-01T00:00:00Z", end: "2024-01-01T00:00:00Z" } }), "q").state, "invalid");
  assert.equal(parsePlan(JSON.stringify({ ...plan, terms: [], constraints: [] }), "q").state, "clarification");
});
test("planner uses supplied reference time and sanitizes provider failure", async () => {
  const result = await planQuery("EPFL robotics", "2026-10-11T00:00:00Z", { async plan(instructions, data) {
    assert.equal(JSON.parse(data).referenceInstant, "2026-10-11T00:00:00Z");
    return JSON.stringify(plan);
  } }); assert.equal(result.state, "planned");
  const failed = await planQuery("q", "2026-10-11T00:00:00Z", { async plan() { throw new Error("private"); } });
  assert.deepEqual(failed, { state: "unavailable" });
});
test("encounter windows are inclusive/exclusive and preserve unknown date coverage", () => {
  const window = { start: "2025-01-01T00:00:00Z", end: "2026-01-01T00:00:00Z" };
  const candidate = (id, date, complete = true) => ({ id, facts: [], completeFields: complete ? ["encounter_date"] : [],
    evidence: [{ id: `${id}-date`, objectId: id, text: "captured robotics", layer: "extracted", verified: true }],
    encounters: date ? [{ occurredAt: date, evidenceId: `${id}-date` }] : [] });
  const result = retrieveEvidence({ mode: "recall", terms: ["robotics"], constraints: [], encounteredBetween: window }, [
    candidate("start", window.start), candidate("end", window.end), candidate("unknown", null, false),
  ]);
  assert.deepEqual(result.matches.map((r) => r.candidate.id), ["start"]);
  assert.deepEqual(result.uncertain.map((r) => r.candidate.id), ["unknown"]);
});

test("ambiguous plans stop before retrieval; retrieval failure is sanitized", async () => {
  const ambiguous = await plannedQuery("q", "2026-10-11T00:00:00Z", {
    planner: { async plan() { return JSON.stringify({ ...plan, ambiguities: ["Unclear date"] }); } },
    reader: { async read() { assert.fail("must not read"); } },
  });
  assert.equal(ambiguous.plan.state, "clarification"); assert.equal(ambiguous.result, null);
  const failed = await plannedQuery("q", "2026-10-11T00:00:00Z", {
    planner: { async plan() { return JSON.stringify(plan); } },
    reader: { async read() { throw new Error("private SQL and credentials"); } },
  });
  assert.equal(failed.error, "RETRIEVAL_UNAVAILABLE");
  assert.equal(JSON.stringify(failed).includes("private SQL"), false);
});
