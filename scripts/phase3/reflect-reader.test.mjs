import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const compiled = await build({ stdin: { contents: `
  export {readRetrievalTransaction} from './lib/retrieval/postgres-reader';
  export {migrationId} from './lib/migration/identity';
`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { readRetrievalTransaction, migrationId } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64'));

test('Reflect reader requires current managed Concept proof, including frozen meaning', async () => {
  const personId = randomUUID(), conceptId = randomUUID(), requestId = randomUUID();
  const edgeId = migrationId(`reviewed-concept-v1:${personId}:${conceptId}`);
  const request = { decision: 'confirm', requestId, subjectId: personId, conceptId, reason: 'I reviewed this association.', expectedConcept: { label: 'Craft', kind: 'concept' } };
  let proofRows = [];
  const queries = [];
  const sql = async (parts) => {
    if (!parts.raw) return [];
    const query = parts.join('?'); queries.push(query);
    if (query.includes('select id, kind from public.object_ref')) return [{ id: personId, kind: 'person' }];
    if (query.includes('select p.id, p.name')) return [{ id: personId, name: 'Synthetic Person', headline: 'Saved person' }];
    if (query.includes('select r.id, r.from_object_id as "personId"')) return [{ id: edgeId, personId, conceptId, conceptLabel: 'Craft' }];
    if (query.includes('o.body_text as reason')) return proofRows;
    return [];
  };
  const read = async () => {
    const input = { mode: 'reflect', terms: [], constraints: [] };
    await readRetrievalTransaction(sql, input);
    return input.patternInputData[0].reviewedConcepts;
  };
  assert.deepEqual(await read(), []); // Raw active edge is insufficient.
  const proof = { id: migrationId(`reviewed-concept-decision-v1:${requestId}`), request, reason: request.reason, state: 'active', eligible: true, label: 'Craft', kind: 'concept' };
  proofRows = [proof];
  assert.equal((await read())[0].observationId, proof.id);
  assert.equal((await read())[0].reason, request.reason);
  for (const change of [{ eligible: false }, { state: 'rejected' }, { label: 'Renamed' }, { kind: 'topic' }, { reason: 'Mismatched reason' }, { id: randomUUID() }]) {
    proofRows = [{ ...proof, ...change }];
    assert.deepEqual(await read(), []);
  }
  assert.ok(queries.some(query => query.includes("r.origin_key='reviewed-concept-v1:'||r.from_object_id::text||':'||r.to_object_id::text")));
});

test('Reflect HTML renders the exact qualifying description and legacy qualification', async () => {
  const result = await build({ entryPoints: ['components/query/MemoryBlock.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom', 'next/link'] });
  const require = createRequire(import.meta.url), module = { exports: {} };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, require);
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const description = 'Working with craftsmen, I gained hands-on experience in creating bespoke furniture.';
  const block = { type: 'memory', mode: 'reflect', state: 'matches', questions: [], items: [], patterns: [{ id: 'p', observationCopy: 'Several people you saved have worked in industrial or furniture design.', supportingPeopleCount: 3, totalPopulation: 3, supportingPeople: [{ personId: randomUUID(), personName: 'Synthetic Person', signals: [{ supportKind: 'structured_fact', label: 'Role', value: 'Design Intern @ Studio', detail: description, provenance: { legacyStatus: 'legacy_unverified' } }] }] }] };
  const html = renderToStaticMarkup(React.createElement(module.exports.MemoryBlock, { block, at: 0 }));
  assert.ok(html.includes(description));
  assert.ok(html.includes('have worked'));
  assert.ok(html.includes('domain classification is inferred, not reviewed proof'));
  assert.ok(html.includes('Design Intern @ Studio'));
});
