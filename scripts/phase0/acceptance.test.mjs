import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

// Exercise existing citation behavior with synthetic evidence, without DB or provider access.
const bundled = await build({ entryPoints: ["lib/ask/prompt.ts"], bundle: true,
  write: false, platform: "node", format: "esm", logLevel: "silent" });
const { citedDocuments, userMessage } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);
const document = { personId: "fixture-person", personName: "Alex Example",
  artifactId: "fixture-artifact", kind: "post", text: "A source about material research.",
  capturedAt: new Date("2026-01-15T12:00:00Z") };

test("a matching author/date citation retains its supporting document", () => {
  assert.deepEqual(citedDocuments([document], [{ author: "Alex Example", date: "Jan 2026" }]), [document]);
});

test("an unsupported citation date must not become evidence", () => {
  assert.deepEqual(citedDocuments([document], [{ author: "Alex Example", date: "Jan 1990" }]), []);
});

test("generated profile synthesis must be explicitly labeled as inference in answer context", () => {
  const context = userMessage("What was captured?", [{ ...document, kind: "synthesis" }]);
  assert.match(context, /inferred|inference|generated/i);
});
