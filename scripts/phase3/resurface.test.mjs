import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["lib/retrieval/evidence.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { retrieveEvidence } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`
);

const evidence = (id, objectId, text, layer = "extracted", verified = true) => ({
  id,
  objectId,
  text,
  layer,
  verified,
});

const candidate = (id, text, opts = {}) => ({
  id,
  completeFields: opts.completeFields ?? [],
  evidence: [
    evidence(`${id}-text`, id, text, opts.layer ?? "extracted"),
    ...(opts.userNote ? [evidence(`${id}-user-note`, id, opts.userNote, "user")] : []),
    ...(opts.extraEvidence ?? []),
  ],
  facts: opts.facts ?? [],
  semanticScore: opts.semanticScore,
  semanticConceptMatches: opts.semanticConceptMatches,
  authorId: opts.authorId,
  sourceDomain: opts.sourceDomain,
});

const query3D = {
  mode: "resurface",
  terms: ["3d", "interaction", "website", "performant"],
  constraints: [],
  question: "I’m working on a performant 3D interaction website. What have I encountered before that might help?",
};

// 1. Vocabulary bridge (3D Test)
test("1. Vocabulary bridge: 3D interaction query resurfaces WebGL/three.js shaders with 0 lexical overlap", () => {
  const threeJsPost = candidate(
    "artifact-threejs",
    "Deep dive into three.js draw calls, shader complexity, GPU bottlenecks, and maintaining 60fps in the browser canvas.",
    { semanticScore: 0.82 }
  );
  const irrelevantPost = candidate(
    "artifact-baking",
    "Baking sourdough bread at home with wild yeast starters and dutch ovens.",
    { semanticScore: 0.15 }
  );

  const retrieval = retrieveEvidence(query3D, [threeJsPost, irrelevantPost]);
  assert.equal(retrieval.matches.length, 1);
  assert.equal(retrieval.matches[0].candidate.id, "artifact-threejs");
  assert.equal(retrieval.matches[0].candidate.retrievalReason.headline, "Relevant to your current context");
  assert.ok(retrieval.matches[0].candidate.retrievalReason.score >= 0.48);
});

// 2. Weak token rejection
test("2. Weak token rejection: generic item with single token overlap fails qualification", () => {
  // Contains only "interaction" in a totally irrelevant management context, low semantic score
  const genericPost = candidate(
    "artifact-management",
    "Best practices for team interaction and calendar management across distributed offices.",
    { semanticScore: 0.22 }
  );

  const retrieval = retrieveEvidence(query3D, [genericPost]);
  assert.equal(retrieval.matches.length, 0);
  assert.equal(retrieval.state, "no_match");
});

// 3. User reason strength
test("3. User reason salience boost: user-authored observation outranks equally similar passive item", () => {
  const passive = candidate("art-passive", "WebGL buffer geometry optimizations and vertex caching.", {
    semanticScore: 0.68,
  });
  const withUserNote = candidate("art-with-note", "Shader compiling pipelines for WebGL applications.", {
    semanticScore: 0.68,
    userNote: "Saved this because his frame budgeting trick was brilliantly explained.",
  });

  const retrieval = retrieveEvidence(query3D, [passive, withUserNote]);
  assert.equal(retrieval.matches.length, 2);
  assert.equal(retrieval.matches[0].candidate.id, "art-with-note");
  assert.equal(retrieval.matches[0].candidate.retrievalReason.userSalienceBoost, true);
  assert.ok(retrieval.matches[0].score > retrieval.matches[1].score);
});

// 4. Concept-adjacent match
test("4. Concept-adjacent match: linked Concept WebGL bridges query without creating a graph edge", () => {
  const bridgedArtifact = candidate(
    "artifact-canvas",
    "GPU memory management techniques in modern Chromium browser viewports.",
    {
      semanticScore: 0.60,
      semanticConceptMatches: [{ conceptId: "concept-webgl-uuid", label: "WebGL", score: 0.88 }],
    }
  );

  const retrieval = retrieveEvidence(query3D, [bridgedArtifact]);
  assert.equal(retrieval.matches.length, 1);
  assert.equal(retrieval.matches[0].candidate.retrievalReason.conceptBridge, "WebGL");
  // Ephemeral retrieval reason only; no graph fact created
  assert.equal(retrieval.matches[0].candidate.facts.length, 0);
});

// 5. Hard relationship distinction
test("5. Hard relationship semantics: semantic proximity cannot satisfy structured educated_at filter", () => {
  const epflRequest = {
    mode: "resurface",
    terms: ["robotics"],
    constraints: [{ field: "educated_at", value: "EPFL" }],
  };

  // Person studied at ETH Zurich, but has high semantic proximity to EPFL
  const personEth = candidate("person-eth", "Robotics and mechanical systems researcher in Lausanne.", {
    completeFields: ["educated_at"],
    semanticScore: 0.90,
    facts: [{ field: "educated_at", value: "ETH Zurich", evidenceId: "eth-fact" }],
    extraEvidence: [evidence("eth-fact", "person-eth", "Studied at ETH Zurich", "extracted", true)],
  });

  const retrieval = retrieveEvidence(epflRequest, [personEth]);
  // Must be excluded because educated_at is a hard constraint that wasn't confirmed
  assert.equal(retrieval.matches.length, 0);
});

// 6. Diversity pass
test("6. Diversity pass: suppresses excessive artifacts from the same author/source", () => {
  const authorX = "author-same-uuid";
  const art1 = candidate("art-1", "three.js rendering post 1", { semanticScore: 0.85, authorId: authorX });
  const art2 = candidate("art-2", "three.js rendering post 2", { semanticScore: 0.84, authorId: authorX });
  const art3 = candidate("art-3", "three.js rendering post 3", { semanticScore: 0.83, authorId: authorX });
  const artDiverse = candidate("art-diverse", "WebGPU pipeline and compute shaders", {
    semanticScore: 0.78,
    authorId: "author-other-uuid",
  });

  const retrieval = retrieveEvidence(query3D, [art1, art2, art3, artDiverse]);
  assert.equal(retrieval.matches.length, 3);
  const matchedIds = retrieval.matches.map((m) => m.candidate.id);
  assert.ok(matchedIds.includes("art-1"));
  assert.ok(matchedIds.includes("art-2"));
  // art3 suppressed by author limit of 2
  assert.ok(!matchedIds.includes("art-3"));
  assert.ok(matchedIds.includes("art-diverse"));
});

// 7. Provenance integrity
test("7. Provenance integrity: resurfaced items preserve exact truth layers and evidence references", () => {
  const item = candidate("art-provenance", "Optimizing WebGL draw calls.", {
    semanticScore: 0.80,
    layer: "source",
    userNote: "My personal reaction to this performance tip.",
  });

  const retrieval = retrieveEvidence(query3D, [item]);
  assert.equal(retrieval.matches.length, 1);
  const evidenceList = retrieval.matches[0].candidate.evidence;
  assert.ok(evidenceList.some((e) => e.layer === "source"));
  assert.ok(evidenceList.some((e) => e.layer === "user"));
  // Retrieval reason is separate from truth layer
  assert.equal(retrieval.matches[0].candidate.retrievalReason.headline, "Relevant to your current context");
});

// 8. Recall mode non-regression
test("8. Recall mode non-regression: mode 'recall' rejects 0-token candidate despite high semantic score", () => {
  const recallRequest = {
    mode: "recall",
    terms: ["3d", "interaction"],
    constraints: [],
  };
  const threeJsPost = candidate("art-no-words", "WebGL draw calls and shaders.", {
    semanticScore: 0.95,
  });

  const retrieval = retrieveEvidence(recallRequest, [threeJsPost]);
  // In recall mode, strict lexical overlap is enforced; no-word match must be rejected
  assert.equal(retrieval.matches.length, 0);
  assert.equal(retrieval.state, "no_match");
});

// 9. Trajectory non-regression
test("9. Trajectory non-regression: trajectory constraint requires explicit verified relationship", () => {
  const trajectoryRequest = {
    mode: "recall",
    terms: [],
    constraints: [{ field: "trajectory", value: JSON.stringify({ from: "Mechanical Engineering", to: "AI" }) }],
  };

  const personWithoutTrajectory = candidate("person-no-traj", "Works in robotics and AI.", {
    completeFields: ["trajectory"],
    semanticScore: 0.90,
  });

  const retrieval = retrieveEvidence(trajectoryRequest, [personWithoutTrajectory]);
  assert.equal(retrieval.matches.length, 0);
});

// 10. Reflect non-regression
test("10. Reflect non-regression: mode 'reflect' enforces population defined gates", () => {
  const reflectRequest = {
    mode: "reflect",
    terms: ["common"],
    constraints: [],
    population: { defined: false, total: 0, indexed: 0 },
  };

  const retrieval = retrieveEvidence(reflectRequest, [candidate("c1", "test")]);
  assert.equal(retrieval.state, "insufficient_population");
  assert.equal(retrieval.matches.length, 0);
});
