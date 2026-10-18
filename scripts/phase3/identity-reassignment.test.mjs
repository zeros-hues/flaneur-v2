import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
async function load(path){const b=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm'});return import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].contents).toString('base64')}`);}
const {reassignProfileIdentity,reassignmentInput}=await load('lib/identity/reassignment.ts'),{reassignmentContext}=await load('lib/identity/reassignment-context.ts');
const input=()=>({requestId:randomUUID(),snapshotId:randomUUID(),fromObservationId:randomUUID(),fromPersonId:randomUUID(),personId:randomUUID(),reason:'  Correct person 😀\n  '});
function fixture(request){
 let state={current:{id:request.fromObservationId,personId:request.fromPersonId},links:[request.fromPersonId],receipts:{},reviews:[],jobs:[]};let queue=Promise.resolve();
 const config={available:true,canonical:true,kind:'profile_page',failQueue:false};
 return {config,state:()=>structuredClone(state),change:fn=>fn(state),async transaction(_id,people,work){
  assert.deepEqual(new Set(people),new Set([request.fromPersonId,request.personId]));
  const previous=queue;let release;queue=new Promise(resolve=>{release=resolve;});await previous;const next=structuredClone(state);
  try{const result=await work({receipt:async id=>next.receipts[id]??null,
   snapshot:async()=>{if(!config.available)throw new Error('IDENTITY_CAPTURE_UNAVAILABLE');return {kind:config.kind,adapterId:'linkedin',contentHash:'a'.repeat(64),sourceUrl:'https://www.linkedin.com/in/fixture/'};},
   canonicalPerson:async()=>config.canonical,currentProof:async()=>next.current,noticedPeople:async()=>next.links,
   insertReassignment:async(proof,decision)=>{next.reviews.push({old:decision.fromObservationId,reason:decision.reason});next.current=proof;next.receipts[decision.requestId]={proof,decision};},
   replacePersonLink:async(_from,id)=>{next.links=[id];},queueParse:async fingerprint=>{if(config.failQueue)throw new Error('FIXTURE_QUEUE_FAILED');next.jobs.push(fingerprint);},
  });state=next;return result;}finally{release();}
 }};
}
test('explicit reassignment and simultaneous retries retain one old decision review and one replacement job',async()=>{
 const request=input(),store=fixture(request),results=await Promise.all([reassignProfileIdentity(request,store),reassignProfileIdentity(request,store)]);
 assert.deepEqual(results.map(r=>r.replayed),[false,true]);const state=store.state();assert.equal(state.reviews.length,1);assert.equal(state.jobs.length,1);
 assert.equal(state.reviews[0].reason,request.reason);assert.deepEqual(state.links,[request.personId]);assert.equal(state.current.supersedesId,null);
});
test('stale proofs, wrong historical links and inactive targets cannot reassign',async()=>{
 for(const change of [s=>{s.current=null},s=>{s.current.id=randomUUID()},s=>{s.links=[]},s=>{s.links.push(randomUUID())}]){
  const request=input(),store=fixture(request);store.change(change);await assert.rejects(reassignProfileIdentity(request,store),/STALE_OR_AMBIGUOUS/);assert.equal(store.state().reviews.length,0);
 }
 for(const [change,error] of [[{available:false},'CAPTURE_UNAVAILABLE'],[{canonical:false},'PERSON_UNAVAILABLE'],[{kind:'social_post'},'SNAPSHOT_UNSUPPORTED']]){
  const request=input(),store=fixture(request);Object.assign(store.config,change);await assert.rejects(reassignProfileIdentity(request,store),new RegExp(error));assert.equal(store.state().reviews.length,0);
 }
});
test('queue failure rolls back the review and corrected link together',async()=>{
 const request=input(),store=fixture(request),before=store.state();store.config.failQueue=true;
 await assert.rejects(reassignProfileIdentity(request,store),/FIXTURE_QUEUE_FAILED/);assert.deepEqual(store.state(),before);
});
test('changed reason conflicts while historical replay leaves later rejections and inactive targets alone',async()=>{
 const request=input(),store=fixture(request);await reassignProfileIdentity(request,store);
 await assert.rejects(reassignProfileIdentity({...request,reason:'changed'},store),/REQUEST_CONFLICT/);
 store.change(state=>{state.current=null;state.jobs=[];});store.config.available=false;const before=store.state();
 assert.equal((await reassignProfileIdentity(request,store)).replayed,true);assert.deepEqual(store.state(),before);
});
test('review reasons preserve exact Unicode and whitespace; self reassignment and malformed inputs are rejected',()=>{
 const request=input();assert.equal(reassignmentInput.parse(request).reason,request.reason);
 for(const change of [{reason:''},{reason:'  '},{reason:'x'.repeat(2001)},{reason:'bad\0text'},{reason:'bad\ud800text'},
  {personId:request.fromPersonId},{fromObservationId:'invalid'},{invented:true}])assert.equal(reassignmentInput.safeParse({...request,...change}).success,false);
});
test('review context requires a single current proof and sole matching active Person link',()=>{
 const request=input(),capture={available:true,captureType:'profile',adapterId:'linkedin',hasContentHash:true,
  activeProofs:[{id:request.fromObservationId,personId:request.fromPersonId}],noticedPeople:[request.fromPersonId]},people=[{id:request.fromPersonId,name:'Current person',inactive:false}];
 assert.equal(reassignmentContext(capture,people).fromObservationId,request.fromObservationId);
 for(const change of [{available:false},{activeProofs:[]},{noticedPeople:[]},{noticedPeople:[request.fromPersonId,request.personId]},{activeProofs:[...capture.activeProofs,...capture.activeProofs]}])assert.equal(reassignmentContext({...capture,...change},people),null);
 assert.equal(reassignmentContext(capture,[{...people[0],inactive:true}]),null);
});
