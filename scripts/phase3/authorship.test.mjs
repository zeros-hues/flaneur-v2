import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
async function load(path){const out=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm'});
 return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].contents).toString('base64')}`);}
const {authorshipDecision}=await load('lib/relationships/authorship.ts');
const {reviewHandler}=await load('lib/review/handler.ts');
const {authorshipPanelTarget,authorshipPanelQuery}=await load('lib/relationships/authorship-panels.ts');
const input=()=>({requestId:randomUUID(),snapshotId:randomUUID(),personId:randomUUID(),decision:'confirm',reason:'  Reviewed this post.\nExact reason.  '});
test('authorship panel targets accept only supported object kinds and normalize UUIDs',()=>{
 const id=randomUUID();assert.deepEqual(authorshipPanelTarget.parse({kind:'artifact',id:id.toUpperCase()}),{kind:'artifact',id});
 for(const target of [{kind:'encounter',id},{kind:'person',id:'invalid'},{kind:'person',id,includePrivate:true}])
  assert.equal(authorshipPanelTarget.safeParse(target).success,false);
});
test('authorship history pagination rejects invalid cursors and unknown filters',()=>{
 assert.deepEqual(authorshipPanelQuery.parse({}),{});const cursor=randomUUID();
 assert.deepEqual(authorshipPanelQuery.parse({cursor:cursor.toUpperCase()}),{cursor});
 for(const query of [{cursor:'invalid'},{cursor:null},{q:'automatic author'},{limit:10000}])assert.equal(authorshipPanelQuery.safeParse(query).success,false);
});
test('authorship decisions preserve exact User reasons while normalizing UUIDs',()=>{
 const value=input();const upper={...value,requestId:value.requestId.toUpperCase()};assert.deepEqual(authorshipDecision.parse(upper),value);
});
test('withdrawal requires its exact proof, while confirmations reject unsolicited proof fields',()=>{
 const value=input();assert.equal(authorshipDecision.safeParse({...value,observationId:randomUUID()}).success,false);
 assert.equal(authorshipDecision.safeParse({...value,decision:'reject'}).success,false);
 assert.equal(authorshipDecision.safeParse({...value,decision:'reject',observationId:randomUUID()}).success,true);
});
test('empty, oversized, malformed and control-character reasons cannot be stored',()=>{
 for(const reason of ['', ' \n ', 'x'.repeat(2001),'bad\0reason','bad\u0001reason','bad\ud800reason'])
  assert.equal(authorshipDecision.safeParse({...input(),reason}).success,false);
 assert.equal(authorshipDecision.safeParse({...input(),reason:'Unicode 🦋\n\tline'}).success,true);
});
test('authorship cannot accept inference flags, arbitrary decisions or non-UUID targets',()=>{
 for(const change of [{verified:true},{decision:'infer'},{personId:'url'},{snapshotId:null},{sourceUrl:'https://example.test'}])
  assert.equal(authorshipDecision.safeParse({...input(),...change}).success,false);
});
function setup(authorize=()=>true,fail){let calls=0;const handler=reviewHandler({authorship:{async decide(payload){calls++;authorshipDecision.parse(payload);if(fail)throw fail;return {recorded:true};}}},
 {origin:'https://flaneur.example',authorize});return {handler,calls:()=>calls};}
function request(payload=input(),headers={}){return new Request('https://flaneur.example/api/review',{method:'POST',headers:{origin:'https://flaneur.example','content-type':'application/json',...headers},body:JSON.stringify({action:'review_authorship',payload})});}
test('authorship writer requires owner authorization and exact Origin before reaching storage',async()=>{
 const denied=setup(()=>false);assert.equal((await denied.handler(request())).status,401);assert.equal(denied.calls(),0);
 const foreign=setup();assert.equal((await foreign.handler(request(input(),{origin:'https://foreign.test'}))).status,403);assert.equal(foreign.calls(),0);
});
test('explicit authorship decisions reach storage through the private review boundary',async()=>{
 const data=setup(),result=await data.handler(request());assert.equal(result.status,200);assert.deepEqual(await result.json(),{recorded:true});
 assert.equal(data.calls(),1);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(result.headers.get('x-content-type-options'),'nosniff');
});
test('malformed decisions are rejected and private storage failures stay private',async()=>{
 assert.equal((await setup().handler(request({...input(),personId:'invalid'}))).status,400);
 const result=await setup(()=>true,new Error('PRIVATE_DATABASE_DETAIL')).handler(request());
 assert.equal(result.status,503);assert.deepEqual(await result.json(),{error:'review_unavailable'});
});
test('stale, blocked and conflicting authorship decisions return explicit conflicts',async()=>{
 for(const code of ['AUTHORSHIP_REQUEST_CONFLICT','AUTHORSHIP_STALE','AUTHORSHIP_TARGET_UNAVAILABLE']){
  const result=await setup(()=>true,new Error(code)).handler(request());assert.equal(result.status,409);
  assert.deepEqual(await result.json(),{error:'authorship_review_conflict'});
 }
});
