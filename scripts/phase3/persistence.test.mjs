import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["lib/retrieval/persistence.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { persistEvidence } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const snapshotId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const evidenceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const input = { snapshotId, normalizerVersion: "v1", text: "A😀B", locators: [{ evidenceId, start: 1, end: 2, quote: "😀" }] };
function store() {
  let records = new Map(), locators = new Map(), queue = Promise.resolve();
  const supports = new Map([[evidenceId, { id: evidenceId, snapshotId, excerpt: "😀" }]]);
  return { supports, counts: () => [records.size, locators.size],
    async transaction(id, version, work) {
      const previous = queue; let release;
      queue = new Promise((resolve) => { release = resolve; }); await previous;
      const proposed = new Map(records), links = new Map(locators);
      try {
        const result = await work({
          async findRepresentation(s, v) { return proposed.get(`${s}:${v}`) ?? null; },
          async insertRepresentation(value) { proposed.set(`${value.snapshotId}:${value.normalizerVersion}`, value); },
          async findSupport(id) { return supports.get(id.toLowerCase()) ?? null; },
          async findLocator(id) { return links.get(id) ?? null; },
          async insertLocator(value) { links.set(value.evidenceId, value); },
        });
        records = proposed; locators = links; return result;
      } finally { release(); }
    },
  };
}
test("concurrent retries preserve one representation and locator", async () => {
  const target = store();
  const outputs = await Promise.all([persistEvidence(input, target), persistEvidence(input, target)]);
  assert.deepEqual(outputs[0], outputs[1]); assert.deepEqual(target.counts(), [1, 1]);
});
test("changed text under one version conflicts without altering committed evidence", async () => {
  const target = store(); await persistEvidence(input, target);
  await assert.rejects(persistEvidence({ ...input, text: "changed" }, target), /REPRESENTATION_CONFLICT/);
  assert.deepEqual(target.counts(), [1, 1]);
});
test("invalid second locator rolls back both representation and first locator", async () => {
  const target = store();
  await assert.rejects(persistEvidence({ ...input, locators: [...input.locators, { evidenceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", start: 0, end: 1, quote: "A" }] }, target), /EVIDENCE_NOT_FOUND/);
  assert.deepEqual(target.counts(), [0, 0]);
});
test("new normalizer version requires a new evidence record instead of moving an existing locator", async () => {
  const target = store(); await persistEvidence(input, target);
  await assert.rejects(persistEvidence({ ...input, normalizerVersion: "v2" }, target), /LOCATOR_CONFLICT/);
  assert.deepEqual(target.counts(), [1, 1]);
  await persistEvidence({ ...input, normalizerVersion: "v2", locators: [] }, target);
  assert.deepEqual(target.counts(), [2, 1]);
});
test("foreign snapshot support cannot persist evidence", async () => {
  const target = store(); target.supports.get(evidenceId).snapshotId = evidenceId;
  await assert.rejects(persistEvidence(input, target), /INVALID_TEXT_EVIDENCE/);
  assert.deepEqual(target.counts(), [0, 0]);
});
