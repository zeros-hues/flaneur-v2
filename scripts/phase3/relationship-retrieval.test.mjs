import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export * from './lib/retrieval/relationship-filters';export * from './lib/retrieval/planner';export * from './lib/retrieval/evidence';export * from './lib/retrieval/answer';export * from './lib/query/memory';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {resolveRelationshipPerson,RelationshipClarification,parsePlan,retrieveEvidence,answerContext,memoryQuery}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const person={id:randomUUID(),name:'Ａda Lovelace'},filter={field:'authored_by',value:'Ada Lovelace'};
const plan={mode:'recall',terms:[],constraints:[filter],encounteredBetween:null,ambiguities:[],interpretation:'Posts with reviewed authorship.'};
test('typed plans choose Artifact scope without confusing authored_by with profile_of',()=>{
 const parsed=parsePlan(JSON.stringify(plan),'posts by Ada Lovelace');assert.equal(parsed.state,'planned');assert.deepEqual(parsed.request.objectKinds,['artifact']);
 assert.deepEqual(parsed.request.constraints,[filter]);
 assert.equal(parsePlan(JSON.stringify({...plan,objectKinds:['person']}),'people who wrote posts').state,'clarification');
});
test('relationship identity matching is exact, Unicode-normalized and unique',()=>{
 assert.deepEqual(resolveRelationshipPerson(filter,[person]),person);
 assert.throws(()=>resolveRelationshipPerson({...filter,value:'Ada'},[person]),RelationshipClarification);
 assert.throws(()=>resolveRelationshipPerson(filter,[person,{id:randomUUID(),name:'Ada Lovelace'}]),RelationshipClarification);
});
test('an explicit Person identifier resolves duplicates only when supplied in the question',()=>{
 const value=`person:${person.id}`,query={...filter,value};
 assert.deepEqual(resolveRelationshipPerson(query,[person],`posts by ${value}`),person);
 assert.throws(()=>resolveRelationshipPerson(query,[person],'posts by Ada'),RelationshipClarification);
 assert.throws(()=>resolveRelationshipPerson(query,[],`posts by ${value}`),RelationshipClarification);
});
test('the planner cannot substitute a different saved name or an embedded substring as identity',()=>{
 assert.throws(()=>resolveRelationshipPerson(filter,[person],'posts by Grace Hopper'),RelationshipClarification);
 assert.throws(()=>resolveRelationshipPerson({field:'authored_by',value:'Ada'},[{id:person.id,name:'Ada'}],'posts about Canada'),RelationshipClarification);
 assert.deepEqual(resolveRelationshipPerson(filter,[person],'posts by Ada Lovelace’s account'),person);
});
const relation={id:'relation-proof',objectId:'artifact',text:'robotics in an owner decision',layer:'user',verified:true,filterOnly:true,
 provenance:{observationId:randomUUID(),snapshotId:randomUUID(),relationship:{id:randomUUID(),predicate:'authored_by',personId:person.id}}};
const candidate={id:'artifact',facts:[{...filter,evidenceId:relation.id}],completeFields:['authored_by'],evidence:[relation]};
test('relationship-only queries cite the decision but relationship context cannot supply topical terms',()=>{
 assert.equal(retrieveEvidence({...plan},[candidate]).matches.length,1);
 assert.equal(retrieveEvidence({...plan,terms:['robotics']},[candidate]).matches.length,0);
 const withText={...candidate,evidence:[...candidate.evidence,{id:'source',objectId:'artifact',text:'robotics',layer:'source',verified:true}]};
 assert.equal(retrieveEvidence({...plan,terms:['robotics']},[withText]).matches.length,1);
});
test('a fully checked missing relationship is excluded, not presented as an uncertain identity match',()=>{
 const result=retrieveEvidence(plan,[{...candidate,facts:[],evidence:[{id:'text',objectId:'artifact',text:'Ada',layer:'user',verified:true}]}]);
 assert.equal(result.matches.length,0);assert.equal(result.uncertain.length,0);
 assert.equal(retrieveEvidence({...plan,constraints:[{field:'profile_of',value:filter.value}]},[{...candidate,completeFields:['profile_of']}]).matches.length,0);
});
test('answer context retains the User relationship qualification and identifiers',()=>{
 const item=answerContext([relation]).evidence[0];assert.equal(item.layer,'user');assert.equal(item.filterOnly,true);assert.deepEqual(item.provenance.relationship,relation.provenance.relationship);
});
test('relationship resolution clarification reaches memory UI without becoming an unavailable response',async()=>{
 const result=await memoryQuery('posts by Ada','2026-10-18T00:00:00Z',{planner:{plan:async()=>JSON.stringify(plan)},reader:{read:async()=>{throw new RelationshipClarification(['Choose the intended saved Person.']);}},labels:async()=>{throw new Error('NO_LABEL_READ');}});
 assert.equal(result.state,'clarification');assert.deepEqual(result.questions,['Choose the intended saved Person.']);
});
test('visible result evidence retains relationship support even after many topical matches',async()=>{
 const text=Array.from({length:9},(_,index)=>({id:`topic-${index}`,objectId:'artifact',text:'robotics',layer:'source',verified:true}));
 const result=await memoryQuery('posts about robotics by Ada','2026-10-18T00:00:00Z',{planner:{plan:async()=>JSON.stringify({...plan,terms:['robotics']})},reader:{read:async()=>[{...candidate,evidence:[...text,relation]}]},labels:async()=>[{id:'artifact',kind:'artifact',label:'Saved post'}]});
 assert.equal(result.items[0].evidence[0].id,relation.id);assert.equal(result.items[0].evidence.length,7);
});
