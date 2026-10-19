import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const patternBuild = await build({
  entryPoints: ["lib/retrieval/patterns.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { discoverPatterns } = await import(
  `data:text/javascript;base64,${Buffer.from(patternBuild.outputFiles[0].contents).toString("base64")}`
);

const configBuild = await build({
  entryPoints: ["lib/retrieval/pattern-config.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { PATTERN_CONFIG } = await import(
  `data:text/javascript;base64,${Buffer.from(configBuild.outputFiles[0].contents).toString("base64")}`
);

const evidenceBuild = await build({
  entryPoints: ["lib/retrieval/evidence.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { retrieveEvidence } = await import(
  `data:text/javascript;base64,${Buffer.from(evidenceBuild.outputFiles[0].contents).toString("base64")}`
);

function createMockPerson(id, name, overrides = {}) {
  return {
    id,
    name,
    headline: overrides.headline ?? `Headline for ${name}`,
    location: overrides.location ?? "Global",
    roles: overrides.roles ?? [],
    education: overrides.education ?? [],
    notes: overrides.notes ?? [],
    reviewedConcepts: overrides.reviewedConcepts ?? [],
    reviewedTrajectories: overrides.reviewedTrajectories ?? [],
  };
}

const cohort = (domain, title) => [1, 2, 3].map(id => createMockPerson(`q${id}`, `Person ${id}`, { roles: [{ domain, title }] }));
const domainPattern = (people, domain) => discoverPatterns({ people, totalPopulation: people.length }).find(pattern => pattern.dimensionValue === domain);

test('Kat management roles do not establish web practice; threshold is recounted', () => {
  const people = cohort('web', 'Web Developer');
  people[2] = createMockPerson('kat', 'Kat Kampf', { roles: [
    { title: 'Product Manager III', domain: 'web', organisationName: 'GitHub', description: 'Product for GitHub Education' },
    { title: 'Program Manager II', domain: 'web', organisationName: 'Microsoft', description: 'Product owner for Azure Notebooks' },
  ] });
  assert.equal(domainPattern(people, 'web'), undefined);
});

test('Ananya needs the furniture description, which remains inspectable', () => {
  const people = cohort('industrial-design', 'Industrial Designer');
  people[2] = createMockPerson('ananya', 'Ananya Bagri', { roles: [{ id: 'akfd', title: 'Design Intern', domain: 'industrial-design', organisationName: 'AKFD' }] });
  assert.equal(domainPattern(people, 'industrial-design'), undefined);
  const description = 'Working closely with craftsmen and designers, I gained hands-on experience in creating bespoke furniture.';
  people[2].roles[0].description = description;
  const signal = domainPattern(people, 'industrial-design').supportingPeople.find(p => p.personId === 'ananya').signals[0];
  assert.equal(signal.detail, description);
  assert.equal(signal.provenance.roleId, 'akfd');
  assert.equal(signal.provenance.legacyStatus, 'legacy_unverified');
});

test('Nivedha architecture and urban survey support cannot become industrial design', () => {
  const people = cohort('industrial-design', 'Industrial Designer');
  people[2] = createMockPerson('nivedha', 'Nivedha Nirmal', { roles: [
    { title: 'Design Intern', organisationName: 'Balan and Nambisan Architects', domain: 'industrial-design' },
    { title: 'Urban Design Intern', domain: 'industrial-design', description: 'Onsite urban survey and documentation, interaction with residents, and design intervention proposals.' },
  ] });
  assert.equal(domainPattern(people, 'industrial-design'), undefined);
});

test('Only statement-relevant notes corroborate roles; copy is historical', () => {
  const people = cohort('web', 'Web Developer');
  const initial = domainPattern(people, 'web');
  people.forEach(p => p.notes.push({ id: p.id, body: 'interesting test good portfolio', targetKind: 'person' }));
  const generic = domainPattern(people, 'web');
  assert.equal(generic.compositeScore, initial.compositeScore);
  assert.ok(generic.supportingPeople.every(p => p.signals.every(s => s.supportKind !== 'owner_authored_note')));
  people.slice(0, 2).forEach(p => p.notes.push({ id: `${p.id}-relevant`, body: 'Creative web development', targetKind: 'person' }));
  const relevant = domainPattern(people, 'web');
  assert.ok(relevant.compositeScore > generic.compositeScore);
  assert.match(relevant.observationCopy, /have worked/);
});

test('Reflect applies known exclusions and abstains on unknown constraint/date membership', () => {
  const people = cohort('web', 'Web Developer');
  const request = { mode: 'reflect', terms: [], constraints: [{ field: 'educated_at', value: 'EPFL' }], population: { defined: true, total: 3, indexed: 3 }, patternInputData: people };
  const candidates = people.map(p => ({ id: p.id, facts: [], evidence: [], completeFields: ['educated_at'] }));
  assert.equal(retrieveEvidence(request, candidates).state, 'no_match');
  candidates[0].completeFields = [];
  assert.equal(retrieveEvidence(request, candidates).state, 'insufficient_population');
  const dateRequest = { ...request, constraints: [], encounteredBetween: { start: '2026-01-01', end: '2026-02-01' } };
  assert.equal(retrieveEvidence(dateRequest, candidates).state, 'insufficient_population');
  candidates.forEach(c => c.completeFields = ['encounter_date']);
  assert.equal(retrieveEvidence(dateRequest, candidates).state, 'no_match');
});

test('Reflect cannot count supplied people outside candidate scope', () => {
  const people = cohort('web', 'Web Developer');
  const request = { mode: 'reflect', terms: [], constraints: [], population: { defined: true, total: 2, indexed: 2 }, patternInputData: people };
  assert.equal(retrieveEvidence(request, people.slice(0, 2).map(p => ({ id: p.id, facts: [], evidence: [] }))).state, 'no_match');
});

// 1. Minimum support threshold (conservatively 3 independent People)
test("1. Support threshold: requires at least 3 independent people; 2 people fail qualification", () => {
  const p1 = createMockPerson("p1", "Alice", {
    roles: [{ title: "Product Designer", domain: "industrial-design", organisationName: "Studio A" }],
  });
  const p2 = createMockPerson("p2", "Bob", {
    roles: [{ title: "Hardware Engineer", domain: "industrial-design", organisationName: "Studio B" }],
  });

  const patterns = discoverPatterns({
    people: [p1, p2],
    totalPopulation: 2,
  });

  // Only 2 people; must NOT clear the minimum threshold of 3
  assert.equal(patterns.length, 0);
});

// 2. Anti-inflation: multiple roles/artifacts from the same person count only once
test("2. Anti-inflation: one person with 5 roles in the same domain counts as exactly 1 supporting person", () => {
  const p1 = createMockPerson("p1", "Alice", {
    roles: [
      { title: "Junior Web Dev", domain: "web", organisationName: "Agency 1" },
      { title: "Mid Web Dev", domain: "web", organisationName: "Agency 2" },
      { title: "Senior Web Dev", domain: "web", organisationName: "Agency 3" },
      { title: "Lead Web Dev", domain: "web", organisationName: "Agency 4" },
      { title: "Director of Web", domain: "web", organisationName: "Agency 5" },
    ],
  });
  const p2 = createMockPerson("p2", "Bob", {
    roles: [{ title: "Frontend Engineer", domain: "web", organisationName: "Startup" }],
  });

  const patterns = discoverPatterns({
    people: [p1, p2],
    totalPopulation: 2,
  });

  // Even though there are 6 web roles, there are only 2 distinct people; must NOT qualify
  assert.equal(patterns.length, 0);
});

// 3. Qualification with 3 independent people
test("3. Qualification: 3 independent people in domain 'web' produce a valid pattern", () => {
  const p1 = createMockPerson("p1", "Alice", {
    roles: [{ title: "Creative Web Engineer", domain: "web", organisationName: "Studio X" }],
  });
  const p2 = createMockPerson("p2", "Bob", {
    roles: [{ title: "Frontend Developer", domain: "web", organisationName: "Agency Y" }],
  });
  const p3 = createMockPerson("p3", "Charlie", {
    roles: [{ title: "Web Developer", domain: "web", organisationName: "Lab Z" }],
  });

  const patterns = discoverPatterns({
    people: [p1, p2, p3],
    totalPopulation: 3,
  });

  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].dimensionValue, "web");
  assert.equal(patterns[0].supportingPeopleCount, 3);
  assert.equal(patterns[0].supportingPeople.length, 3);
  assert.ok(patterns[0].observationCopy.includes("web development"));
});

// 4. Specificity scoring: penalizes broad umbrella domain in favor of specific discipline
test("4. Specificity scoring: specific domain 'industrial-design' outranks broad 'creative' despite equal counts", () => {
  // 3 people in industrial-design (high specificity)
  const idPeople = [
    createMockPerson("id1", "Alice", { roles: [{ title: "Industrial Designer", domain: "industrial-design" }] }),
    createMockPerson("id2", "Bob", { roles: [{ title: "Industrial Designer", domain: "industrial-design" }] }),
    createMockPerson("id3", "Charlie", { roles: [{ title: "Industrial Designer", domain: "industrial-design" }] }),
  ];

  // 3 people in generic creative (broad penalty)
  const creativePeople = [
    createMockPerson("c1", "Dave", { roles: [{ title: "Creative Director", domain: "creative" }] }),
    createMockPerson("c2", "Eve", { roles: [{ title: "Creative Director", domain: "creative" }] }),
    createMockPerson("c3", "Frank", { roles: [{ title: "Creative Director", domain: "creative" }] }),
  ];

  const patterns = discoverPatterns({
    people: [...idPeople, ...creativePeople],
    totalPopulation: 6,
  });

  assert.ok(patterns.length >= 2);
  const idPattern = patterns.find((p) => p.dimensionValue === "industrial-design");
  const creativePattern = patterns.find((p) => p.dimensionValue === "creative");

  assert.ok(idPattern);
  assert.ok(creativePattern);
  assert.ok(idPattern.specificityScore > creativePattern.specificityScore);
  assert.ok(idPattern.compositeScore > creativePattern.compositeScore);
});

// 5. User attention theme discovery from owner notes
test("5. Attention themes: repeated Awwwards / SOTD notes across 3 people surface as an honest attention theme", () => {
  const p1 = createMockPerson("p1", "Edoardo", {
    notes: [{ id: "n1", body: "awwwards designer.", targetKind: "person" }],
    roles: [{ title: "Creative Developer", domain: "web" }],
  });
  const p2 = createMockPerson("p2", "Elliott", {
    notes: [{ id: "n2", body: "Many SOTD awards", targetKind: "person" }],
    roles: [{ title: "Web Pioneer", domain: "web" }],
  });
  const p3 = createMockPerson("p3", "Karthikeyan", {
    notes: [{ id: "n3", body: "awwards young jury", targetKind: "person" }],
    roles: [{ title: "Founding Designer", domain: "ui-ux" }],
  });

  const patterns = discoverPatterns({
    people: [p1, p2, p3],
    totalPopulation: 3,
  });

  const awardsPattern = patterns.find((p) => p.dimensionValue === "awards_recognition");
  assert.ok(awardsPattern);
  assert.equal(awardsPattern.supportingPeopleCount, 3);
  assert.ok(awardsPattern.observationCopy.includes("industry recognition"));
  assert.equal(awardsPattern.patternType, "user_attention_theme");

  // Every supporting person's signal is marked as 'owner_authored_note'
  for (const person of awardsPattern.supportingPeople) {
    const noteSignal = person.signals.find((s) => s.supportKind === "owner_authored_note");
    assert.ok(noteSignal);
    assert.equal(noteSignal.label, "Your note");
  }
});

// 6. Distinctive portfolio attention theme
test("6. Attention themes: repeated 'portfolio' notes across 3 people surface as portfolio attention pattern", () => {
  const p1 = createMockPerson("p1", "Eduard", {
    notes: [{ id: "n1", body: "good portfolio", targetKind: "person" }],
  });
  const p2 = createMockPerson("p2", "Lukas", {
    notes: [{ id: "n2", body: "nice portfolio", targetKind: "person" }],
  });
  const p3 = createMockPerson("p3", "Shreya", {
    notes: [{ id: "n3", body: "unique portfolio", targetKind: "person" }],
  });

  const patterns = discoverPatterns({
    people: [p1, p2, p3],
    totalPopulation: 3,
  });

  const portfolioPattern = patterns.find((p) => p.dimensionValue === "distinctive_portfolio");
  assert.ok(portfolioPattern);
  assert.equal(portfolioPattern.supportingPeopleCount, 3);
  assert.ok(portfolioPattern.observationCopy.includes("portfolios"));
});

// 7. No trajectory inference without reviewed trajectory
test("7. Invariant A + B != A -> B: education in Architecture + role in Branding does NOT invent a trajectory pattern", () => {
  const p1 = createMockPerson("p1", "Nivedha", {
    education: [{ school: "MEASI", fieldOfStudy: "Architecture" }],
    roles: [{ title: "Creative Director", domain: "creative", organisationName: "Space Kayak" }],
    notes: [{ id: "n1", body: "architecture to branding", targetKind: "person" }],
  });
  const p2 = createMockPerson("p2", "Simon", {
    education: [{ school: "Design School", fieldOfStudy: "Graphic Design" }],
    roles: [{ title: "Founder", domain: "creative", organisationName: "DixonBaxi" }],
  });
  const p3 = createMockPerson("p3", "Ananya", {
    education: [{ school: "Architecture Lab", fieldOfStudy: "Architecture" }],
    roles: [{ title: "Brand Designer", domain: "creative" }],
  });

  const patterns = discoverPatterns({
    people: [p1, p2, p3],
    totalPopulation: 3,
  });

  // Must NOT produce any trajectory patterns because no reviewed trajectory exists
  const trajectoryPatterns = patterns.filter((p) => p.patternType === "reviewed_concept" || p.id.includes("trajectory"));
  assert.equal(trajectoryPatterns.length, 0);
});

// 8. Accurate support kind classification: legacy facts are NOT mislabeled as V2 source evidence
test("8. Provenance honesty: structured roles are labeled 'structured_fact', notes as 'owner_authored_note'", () => {
  const p1 = createMockPerson("p1", "Alice", {
    roles: [{ title: "Web Developer", domain: "web", organisationName: "Impression" }],
    notes: [{ id: "n1", body: "Creative web development", targetKind: "person" }],
  });
  const p2 = createMockPerson("p2", "Bob", {
    roles: [{ title: "Frontend Lead", domain: "web", organisationName: "Code Resolution" }],
  });
  const p3 = createMockPerson("p3", "Charlie", {
    roles: [{ title: "Creative Web Engineer", domain: "web", organisationName: "Disney" }],
  });

  const patterns = discoverPatterns({
    people: [p1, p2, p3],
    totalPopulation: 3,
  });

  const webPattern = patterns.find((p) => p.dimensionValue === "web");
  assert.ok(webPattern);

  const alice = webPattern.supportingPeople.find((p) => p.personId === "p1");
  assert.ok(alice);

  const roleSignal = alice.signals.find((s) => s.label === "Role");
  assert.ok(roleSignal);
  assert.equal(roleSignal.supportKind, "structured_fact");
  assert.notEqual(roleSignal.supportKind, "source_evidence");

  const noteSignal = alice.signals.find((s) => s.label === "Your note");
  assert.ok(noteSignal);
  assert.equal(noteSignal.supportKind, "owner_authored_note");
});

// 9. Cold-corpus honest abstention via retrieveEvidence
test("9. Cold corpus: retrieveEvidence returns 'no_match' when no pattern meets threshold", () => {
  const p1 = createMockPerson("p1", "Lone 1", { roles: [{ title: "Role 1", domain: "unique-a" }] });
  const p2 = createMockPerson("p2", "Lone 2", { roles: [{ title: "Role 2", domain: "unique-b" }] });

  const reflectRequest = {
    mode: "reflect",
    terms: [],
    constraints: [],
    population: { defined: true, total: 2, indexed: 2 },
    patternInputData: [p1, p2],
  };

  const candidate1 = { id: "p1", facts: [], evidence: [], completeFields: [] };
  const candidate2 = { id: "p2", facts: [], evidence: [], completeFields: [] };

  const retrieval = retrieveEvidence(reflectRequest, [candidate1, candidate2]);
  assert.equal(retrieval.state, "no_match");
  assert.equal(retrieval.matches.length, 0);
  assert.deepEqual(retrieval.patterns, []);
});

// 10. Integration via retrieveEvidence: returns matched patterns and candidates
test("10. Integration: retrieveEvidence successfully discovers patterns and ranks matching candidates", () => {
  const p1 = createMockPerson("p1", "Alice", { roles: [{ title: "Web Developer", domain: "web" }] });
  const p2 = createMockPerson("p2", "Bob", { roles: [{ title: "Web Developer", domain: "web" }] });
  const p3 = createMockPerson("p3", "Charlie", { roles: [{ title: "Web Developer", domain: "web" }] });

  const reflectRequest = {
    mode: "reflect",
    terms: [],
    constraints: [],
    population: { defined: true, total: 3, indexed: 3 },
    patternInputData: [p1, p2, p3],
  };

  const candidates = [
    { id: "p1", facts: [], evidence: [{ id: "e1", objectId: "p1", text: "note 1", layer: "user", verified: true }], completeFields: [] },
    { id: "p2", facts: [], evidence: [{ id: "e2", objectId: "p2", text: "note 2", layer: "user", verified: true }], completeFields: [] },
    { id: "p3", facts: [], evidence: [], completeFields: [] },
  ];

  const retrieval = retrieveEvidence(reflectRequest, candidates);
  assert.equal(retrieval.state, "matched");
  assert.equal(retrieval.matches.length, 3);
  assert.ok(retrieval.patterns);
  assert.equal(retrieval.patterns.length, 1);
  assert.equal(retrieval.patterns[0].dimensionValue, "web");

  // Candidates receive their patternSupport
  assert.ok(candidates[0].patternSupport.length > 0);
});

// 11. Recall non-regression
test("11. Recall non-regression: recall mode rejects candidate with no lexical overlap", () => {
  const recallRequest = {
    mode: "recall",
    terms: ["robotics"],
    constraints: [],
  };
  const c = { id: "c1", facts: [], evidence: [{ id: "e1", objectId: "c1", text: "baking bread", layer: "source", verified: true }], completeFields: [] };
  const result = retrieveEvidence(recallRequest, [c]);
  assert.equal(result.state, "no_match");
});

// 12. Population gating non-regression
test("12. Population gating non-regression: undefined or partial population returns insufficient_population", () => {
  const reflectRequest = {
    mode: "reflect",
    terms: [],
    constraints: [],
    population: { defined: true, total: 5, indexed: 3 },
  };
  const c = { id: "c1", facts: [], evidence: [], completeFields: [] };
  const result = retrieveEvidence(reflectRequest, [c]);
  assert.equal(result.state, "insufficient_population");
});
