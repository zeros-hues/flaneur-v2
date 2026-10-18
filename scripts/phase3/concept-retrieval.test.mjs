import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
const out=await build({stdin:{contents:`export * from './lib/retrieval/relationship-filters';export * from './lib/retrieval/planner';export * from './lib/retrieval/evidence';export * from './lib/retrieval/answer';export * from './lib/query/memory';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {resolveRelationshipConcept,RelationshipClarification,relationshipKinds,parsePlan,retrieveEvidence,answerContext,memoryQuery}=await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].contents).toString('base64')}`);
const concept={id:randomUUID(),label:'Ｃorrespondence',kind:'concept'},filter={field:'associated_with_concept',value:'Correspondence'};
const plan={mode:'recall',terms:[],constraints:[filter],encounteredBetween:null,ambiguities:[],interpretation:'Owner-reviewed Concept associations.'};
test('Concept plans preserve explicit Person/Artifact populations and choose both only for an unscoped request',()=>{
 for(const kinds of [['person'],['artifact'],['person','artifact']])assert.deepEqual(parsePlan(JSON.stringify({...plan,objectKinds:kinds}),'associations with Correspondence').request.objectKinds,kinds);
 assert.deepEqual(parsePlan(JSON.stringify(plan),'my associations with Correspondence').request.objectKinds,['person','artifact']);
 assert.equal(parsePlan(JSON.stringify({...plan,objectKinds:['encounter']}),'encounters associated with Correspondence').state,'clarification');
});
test('combined author/Concept filters retain Artifact scope and do not reinterpret reverse Person queries',()=>{
 const request={...plan,constraints:[filter,{field:'authored_by',value:'Ada'}]};assert.deepEqual(relationshipKinds(request),['artifact']);
 assert.throws(()=>relationshipKinds({...request,objectKinds:['person']}),RelationshipClarification);
});
test('Concept labels resolve by exact normalized identity across categories, never fuzzy grouping',()=>{
 assert.deepEqual(resolveRelationshipConcept(filter,[concept],'my association with Correspondence'),concept);
 assert.throws(()=>resolveRelationshipConcept({...filter,value:'Correspond'},[concept]),RelationshipClarification);
 assert.throws(()=>resolveRelationshipConcept(filter,[concept,{id:randomUUID(),label:'Correspondence',kind:'topic'}]),RelationshipClarification);
});
test('only a literally supplied concept:UUID can resolve a duplicated or ambiguous label',()=>{
 const value=`concept:${concept.id}`,constraint={...filter,value};assert.deepEqual(resolveRelationshipConcept(constraint,[concept],`my associations with ${value}`),concept);
 assert.throws(()=>resolveRelationshipConcept(constraint,[concept],'my associations with Correspondence'),RelationshipClarification);
 assert.throws(()=>resolveRelationshipConcept(constraint,[],`my associations with ${value}`),RelationshipClarification);
});
test('substituted labels and embedded words cannot silently select a different Concept',()=>{
 assert.throws(()=>resolveRelationshipConcept(filter,[concept],'my associations with Botany'),RelationshipClarification);
 assert.throws(()=>resolveRelationshipConcept({...filter,value:'Art'},[{...concept,label:'Art'}],'my associations with Cartography'),RelationshipClarification);
});
const relationship={id:'concept-proof',objectId:'person',text:'robotics owner interpretation',layer:'user',verified:true,filterOnly:true,
 provenance:{observationId:randomUUID(),relationship:{id:randomUUID(),predicate:'associated_with_concept',conceptId:concept.id,conceptLabel:'Correspondence',conceptKind:'concept'}}};
const candidate={id:'person',completeFields:['associated_with_concept'],facts:[{...filter,evidenceId:relationship.id}],evidence:[relationship]};
test('reviewed Concept context satisfies only its explicit filter, not missing topical content',()=>{
 assert.equal(retrieveEvidence(plan,[candidate]).matches.length,1);
 assert.equal(retrieveEvidence({...plan,terms:['robotics']},[candidate]).matches.length,0);
 assert.equal(retrieveEvidence(plan,[{...candidate,facts:[]}]).uncertain.length,0);
});
test('answer context keeps Concept decision identity and interpretation metadata without inventing Person/source provenance',()=>{
 const item=answerContext([relationship]).evidence[0];assert.equal(item.layer,'user');assert.equal(item.filterOnly,true);
 assert.deepEqual(item.provenance.relationship,relationship.provenance.relationship);assert.equal(item.provenance.relationship.personId,undefined);assert.equal(item.provenance.snapshotId,undefined);
});
test('Concept clarification is displayed without reading labels or returning a generic outage',async()=>{
 const result=await memoryQuery('people I associated with Correspondence','2026-10-18T00:00:00Z',{
  planner:{plan:async()=>JSON.stringify({...plan,objectKinds:['person']})},reader:{read:async()=>{throw new RelationshipClarification(['Use the intended concept:UUID.']);}},labels:async()=>{throw new Error('UNEXPECTED_LABEL_READ');}});
 assert.equal(result.state,'clarification');assert.deepEqual(result.questions,['Use the intended concept:UUID.']);
});
