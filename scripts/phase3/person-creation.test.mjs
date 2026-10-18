import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
const output=await build({entryPoints:['lib/identity/creation.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {createPersonFromProfile,personCreationInput}=await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString('base64')}`);
const input=()=>({requestId:randomUUID(),snapshotId:randomUUID(),name:'  Ada 😀  '});
function fixture(){
 let state={people:[],proof:null,receipt:null,linked:[],jobs:[]};let gate=Promise.resolve();
 const config={ready:true,available:true,failQueue:false,kind:'profile_page',prior:false};
 return {config,state:()=>structuredClone(state),async transaction(snapshotId,work){
  const previous=gate;let release;gate=new Promise(resolve=>{release=resolve;});await previous;const next=structuredClone(state);
  try{const result=await work({creationReceipt:async()=>next.receipt,sourceNeutralPeople:async()=>config.ready,
   snapshot:async()=>{if(!config.available)throw new Error('IDENTITY_CAPTURE_UNAVAILABLE');return {kind:config.kind,adapterId:'linkedin',contentHash:'a'.repeat(64),sourceUrl:'https://www.linkedin.com/in/fixture/'};},
   currentProof:async()=>config.prior?{id:'prior'}:next.proof,noticedPeople:async()=>next.linked,
   createPerson:async(id,name)=>next.people.push({id,name}),insertProof:async(proof,_id,creation)=>{next.proof=proof;next.receipt={proof,name:creation.name};},
   linkPerson:async id=>next.linked.push(id),queueParse:async fingerprint=>{if(config.failQueue)throw new Error('FIXTURE_QUEUE_FAILURE');next.jobs.push(fingerprint);},
  });state=next;return result;}finally{release();}
 }};
}
test('explicit creation and simultaneous retries commit one Person, proof, Encounter link and parse job',async()=>{
 const store=fixture(),request=input(),results=await Promise.all([createPersonFromProfile(request,store),createPersonFromProfile(request,store)]);
 assert.deepEqual(results.map(r=>r.replayed),[false,true]);const state=store.state();assert.equal(state.people.length,1);
 assert.equal(state.people[0].name,'Ada 😀');assert.equal(state.jobs.length,1);assert.equal(state.linked[0],state.people[0].id);
});
test('changed retry payloads conflict and historical replay does not inspect inactive targets or recreate a Person',async()=>{
 const store=fixture(),request=input();await createPersonFromProfile(request,store);
 await assert.rejects(createPersonFromProfile({...request,name:'Different'},store),/IDENTITY_REQUEST_CONFLICT/);
 await assert.rejects(createPersonFromProfile({...request,snapshotId:randomUUID()},store),/IDENTITY_REQUEST_CONFLICT/);
 store.config.ready=false;store.config.available=false;const before=store.state();
 assert.equal((await createPersonFromProfile(request,store)).replayed,true);assert.deepEqual(store.state(),before);
});
test('migration readiness, active capture, supported kind and prior association checks precede Person creation',async()=>{
 for(const [change,error] of [[{ready:false},'PERSON_CREATION_NOT_READY'],[{available:false},'IDENTITY_CAPTURE_UNAVAILABLE'],
  [{kind:'social_post'},'IDENTITY_SNAPSHOT_UNSUPPORTED'],[{prior:true},'IDENTITY_REASSIGNMENT_REQUIRES_REVIEW']]){
  const store=fixture();Object.assign(store.config,change);await assert.rejects(createPersonFromProfile(input(),store),new RegExp(error));assert.equal(store.state().people.length,0);
 }
});
test('a parse queue failure rolls back the new Person and its identity decision together',async()=>{
 const store=fixture();store.config.failQueue=true;await assert.rejects(createPersonFromProfile(input(),store),/FIXTURE_QUEUE_FAILURE/);
 assert.deepEqual(store.state(),{people:[],proof:null,receipt:null,linked:[],jobs:[]});
});
test('names stay bounded Unicode text and caller-supplied identity, URLs and controls are rejected',()=>{
 for(const change of [{name:''},{name:'   '},{name:'x'.repeat(201)},{name:'Bad\0name'},{name:'Bad\nname'},{name:'Bad\ud800name'},
  {personId:randomUUID()},{profileUrl:'https://example.test/'}])assert.equal(personCreationInput.safeParse({...input(),...change}).success,false);
 assert.equal(personCreationInput.parse(input()).name,'Ada 😀');
});
