import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export * from './lib/relationships/concept-association';export * from './lib/relationships/concept-reader';export * from './lib/review/handler';export * from './lib/review/confirmation';export * from './lib/review/correction';export * from './lib/review/rejection';export * from './lib/review/archive';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const {conceptDecision,conceptPanelQuery,conceptPanelTarget,reviewHandler,confirmObservation,correctObservation,rejectObservation,archiveObservation}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const input=()=>({requestId:randomUUID(),subjectId:randomUUID(),conceptId:randomUUID(),decision:'confirm',expectedConcept:{label:'Correspondence',kind:'concept'},reason:'  My interpretation.\nExact words 🦋  '});
test('Concept decisions preserve reasons, normalize UUIDs and retain expected label/category',()=>{
 const value=input();assert.deepEqual(conceptDecision.parse({...value,subjectId:value.subjectId.toUpperCase()}),value);
});
test('Concept confirmation requires explicit expected meaning; withdrawal requires an exact proof',()=>{
 const value=input();for(const change of [{expectedConcept:undefined},{expectedConcept:{label:'Topic',kind:'inferred'}},{observationId:randomUUID()}])
  assert.equal(conceptDecision.safeParse({...value,...change}).success,false);
 const {expectedConcept,...other}=value;void expectedConcept;
 assert.equal(conceptDecision.safeParse({...other,decision:'reject'}).success,false);
 assert.equal(conceptDecision.safeParse({...other,decision:'reject',observationId:randomUUID()}).success,true);
});
test('empty, oversized and malformed reasons and unknown fields cannot enter association storage',()=>{
 for(const reason of ['', ' \n ', 'x'.repeat(2001),'bad\0reason','bad\ud800reason'])assert.equal(conceptDecision.safeParse({...input(),reason}).success,false);
 assert.equal(conceptDecision.safeParse({...input(),inferred:true}).success,false);
});
test('Concept panel targets exclude unsupported objects and keep the three object kinds distinct',()=>{
 for(const kind of ['person','artifact','concept'])assert.equal(conceptPanelTarget.safeParse({kind,id:randomUUID()}).success,true);
 assert.equal(conceptPanelTarget.safeParse({kind:'organisation',id:randomUUID()}).success,false);
});
test('association, Concept-search and proof-history cursors cannot silently change query scope',()=>{
 const cursor=randomUUID();assert.equal(conceptPanelQuery.safeParse({searchCursor:cursor}).success,false);
 assert.equal(conceptPanelQuery.safeParse({historyCursor:cursor}).success,false);
 assert.equal(conceptPanelQuery.safeParse({historyEdge:cursor,historyCursor:cursor}).success,true);
 assert.equal(conceptPanelQuery.safeParse({historyEdge:cursor,q:'Concept'}).success,false);
 assert.equal(conceptPanelQuery.safeParse({historyEdge:cursor,cursor}).success,false);
 assert.equal(conceptPanelQuery.safeParse({q:'Concept',searchCursor:cursor}).success,true);
 assert.equal(conceptPanelQuery.safeParse({q:'x',limit:10000}).success,false);
});
test('generic review actions cannot independently promote, revise, reject or archive dedicated associations',async()=>{
 const value={requestId:randomUUID(),observationId:randomUUID()},tx={receipt:async()=>null,confirmationReceipt:async()=>null,correctionReceipt:async()=>null,
  observation:async()=>({active:true,layer:'user',identityProof:false,relationshipReview:true,bodyText:'Owner words'})};
 const store={transaction:async(id,work)=>work(tx)};
 for(const action of [()=>confirmObservation(value,store),()=>correctObservation({...value,bodyText:'changed'},store),()=>rejectObservation(value,store),()=>archiveObservation(value,store)])
  await assert.rejects(action,/RELATIONSHIP_REVIEW_REQUIRED/);
});
const request=()=>new Request('https://flaneur.example/api/review',{method:'POST',headers:{origin:'https://flaneur.example','content-type':'application/json'},body:JSON.stringify({action:'review_concept_association',payload:input()})});
test('Concept decisions use the owner/Origin review boundary before touching storage',async()=>{
 let calls=0;const dependencies={conceptAssociation:{async decide(payload){calls++;conceptDecision.parse(payload);return {recorded:true};}}};
 const denied=reviewHandler(dependencies,{origin:'https://flaneur.example',authorize:()=>false});assert.equal((await denied(request())).status,401);assert.equal(calls,0);
 const handler=reviewHandler(dependencies,{origin:'https://flaneur.example',authorize:()=>true}),foreign=request();foreign.headers.set('origin','https://foreign.test');
 assert.equal((await handler(foreign)).status,403);assert.equal(calls,0);
 const response=await handler(request());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(calls,1);
});
test('Concept conflicts are explicit while private failure details stay private',async()=>{
 for(const code of ['CONCEPT_ASSOCIATION_REQUEST_CONFLICT','CONCEPT_ASSOCIATION_STALE','CONCEPT_ASSOCIATION_TARGET_UNAVAILABLE','PRIVATE_DATABASE_DETAIL']){
  const response=await reviewHandler({conceptAssociation:{decide:async()=>{throw new Error(code);}}},{origin:'https://flaneur.example',authorize:()=>true})(request());
  assert.equal(response.status,code==='PRIVATE_DATABASE_DETAIL'?503:409);assert.equal((await response.text()).includes(code),false);
 }
});
