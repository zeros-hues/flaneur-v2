import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const bundle = await build({ stdin: { contents: `
 export {captureV2} from './lib/capture/v2-contract';
 export {validateCapture} from './extension/lib/capture-v2';
 export {captureActivation} from './lib/capture/activation';
 export {captureSourcePlan} from './lib/capture/source-plan';
 export {normalizeCapture} from './lib/retrieval/normalize';
 export {capturedSourceEvidence} from './lib/retrieval/captured-source';
 export {parseFingerprint} from './lib/processing/parse-input';
 export {patternOwnerNotes} from './lib/retrieval/pattern-owner-notes';
 export {semanticFingerprint,checkedVector} from './lib/processing/capture-semantic';
 export {captureReadiness} from './lib/capture/readiness';
`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const web = () => ({ version: 2, requestId: randomUUID(), adapterId: 'web', kind: 'article', sourceUrl: 'https://project.example.test/3d', html: '<article data-flaneur-source="web"><h1>Mobile 3D performance</h1><p>Instancing and adaptive rendering.</p><script>secret</script><input value="secret"/></article>', reasonForNoticing: 'Smart approach to 3D mobile performance.', urn: null, extensionVersion: '0.3.0', clientCapturedAt: new Date().toISOString() });

test('web captures have matching strict server/extension contracts and no LinkedIn masquerading', () => {
  const body = web(); assert.ok(api.captureV2.safeParse(body).success); assert.deepEqual(api.validateCapture(body), body);
  for (const change of [{ sourceUrl: 'not a URL' }, { adapterId: 'linkedin' }, { kind: 'profile_page' }, { urn: 'urn:li:activity:12' }, { sourceUrl: 'https://www.linkedin.com/in/a/' }, { sourceUrl: 'http://project.example.test/' }, { sourceUrl: 'https://user:password@project.example.test/' }]) {
    const invalid = { ...body, ...change }; assert.equal(api.captureV2.safeParse(invalid).success, false); assert.throws(() => api.validateCapture(invalid));
  }
});
test('same exact web URL resolves one source but request identity remains separate', () => {
  const body = web(), first = api.captureSourcePlan(body, randomUUID()), next = api.captureSourcePlan({ ...body, requestId: randomUUID() }, randomUUID());
  assert.equal(first.migrationKey, next.migrationKey); assert.equal(first.basis, 'exact_web_url'); assert.equal(first.adapterId, 'web');
  assert.notEqual(first.migrationKey, api.captureSourcePlan({ ...body, sourceUrl: body.sourceUrl + '?variant=2' }, randomUUID()).migrationKey);
});
test('generic page normalization and evidence keep exact source provenance without inventing Person facts', () => {
  const body = web(), snapshotId = randomUUID(), source = api.normalizeCapture(snapshotId, 'article', body.html);
  assert.equal(source.text.includes('secret'), false); assert.equal(source.normalizerVersion, 'web-captured-text-v1:article');
  const row = { ...source, artifactId: randomUUID(), encounterId: randomUUID(), adapterId: 'web', kind: 'article', sourceUrl: body.sourceUrl, contentHash: 'a'.repeat(64) };
  row.fingerprint = api.parseFingerprint(row);
  const evidence = api.capturedSourceEvidence(row, null); assert.equal(evidence.length, 2); assert.ok(evidence.every(item => item.layer === 'source' && item.provenance.representationId === source.id));
  assert.deepEqual(api.capturedSourceEvidence({ ...row, text: row.text + 'tampered' }, null), []);
});
test('activation requires all controls and exact allowed hosts', () => {
  const env = { CAPTURE_V2_ENABLED: 'true', CAPTURE_V2_ACTIVATED_AT: '2026-10-19T00:00:00Z', CAPTURE_V2_ALLOWED_HOSTS: 'www.linkedin.com,project.example.test' };
  assert.equal(api.captureActivation(env).enabled, true); assert.equal(api.captureActivation(env).accepts(web().sourceUrl), true);
  assert.equal(api.captureActivation(env).accepts('https://project.example.test.evil.test'), false);
  for (const change of [{ CAPTURE_V2_ENABLED: 'false' }, { CAPTURE_V2_ACTIVATED_AT: '' }, { CAPTURE_V2_ALLOWED_HOSTS: '*' }]) assert.equal(api.captureActivation({ ...env, ...change }).enabled, false);
});
test('semantic jobs pin representation, parse input, notes and model; malformed vectors cannot publish', () => {
  const input = { snapshotId: randomUUID(), artifactId: randomUUID(), representationId: randomUUID(), text: 'Source', textHash: 'a'.repeat(64), parseFingerprint: 'b'.repeat(64), notes: [] };
  assert.notEqual(api.semanticFingerprint(input, 'index'), api.semanticFingerprint(input, 'enrich'));
  for (const change of [{ notes: [{ id: randomUUID(), body: 'new reason' }] }, { parseFingerprint: 'c'.repeat(64) }, { representationId: randomUUID() }]) assert.notEqual(api.semanticFingerprint(input, 'index'), api.semanticFingerprint({ ...input, ...change }, 'index'));
  for (const vector of [[], Array(768).fill(0), Array(767).fill(1), Array(768).fill(NaN)]) assert.throws(() => api.checkedVector(vector));
  assert.equal(api.checkedVector(Array(768).fill(1)).length, 768);
});
test('new reasons reach Person Reflect only through current explicit identity, never legacy attribution', () => {
  const personId = randomUUID(), encounterId = randomUUID(), snapshotId = randomUUID(), reasonId = randomUUID(), proofId = randomUUID();
  const person = { id: personId, evidence: [{ verified: true, provenance: { observationId: reasonId } }] };
  const data = { observations: [{ id: reasonId, subjectId: encounterId, layer: 'user', semanticRole: 'reason_for_noticing', text: 'branding agency' }, { id: proofId, subjectId: personId }], encounters: [{ id: encounterId, snapshotId }], links: [{ encounterId, objectId: personId, relation: 'noticed' }], derivationHeads: [{ snapshotId, identityObservationId: proofId, identityActive: true }] };
  assert.equal(api.patternOwnerNotes(person, data)[0].body, 'branding agency');
  assert.deepEqual(api.patternOwnerNotes(person, { ...data, derivationHeads: [] }), []);
  assert.deepEqual(api.patternOwnerNotes(person, { ...data, links: [{ encounterId, objectId: personId, relation: 'author' }] }), []);
  assert.deepEqual(api.patternOwnerNotes(person, { ...data, observations: data.observations.map(row => row.id === proofId ? { ...row, subjectId: randomUUID() } : row) }), []);
});
test('progress never equates parse completion with semantic readiness', () => {
  assert.equal(api.captureReadiness({ parse: 'succeeded' }), 'Saved. Processing.');
  assert.equal(api.captureReadiness({ parse: 'succeeded', index: 'failed' }), 'Saved. Processing needs attention.');
  assert.equal(api.captureReadiness({ parse: 'succeeded', index: 'succeeded', enrich: 'succeeded' }), 'Ready in memory.');
});
test('controlled worker check never loads credentials, claims jobs or calls providers', () => {
  const report = JSON.parse(execFileSync(process.execPath, ['scripts/processing/capture.mjs', '--check'], { env: { ...process.env, DATABASE_URL: 'invalid' }, encoding: 'utf8' }));
  assert.equal(report.worker_started, false); assert.equal(report.historical_queue, false); assert.equal(report.providers_enabled, false);
});
