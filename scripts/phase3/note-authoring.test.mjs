import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
async function load(path){const output=await build({entryPoints:[path],bundle:true,write:false,platform:"node",format:"esm"});return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);}
const {createUserNote}=await load("lib/notes/authoring.ts"),{userNoteHandler}=await load("lib/notes/handler.ts");
const person="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",requestId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const input={personId:person,requestId,body:"  Exact User words 😀\n  "};
function setup(){const records=new Map();let active=true,invalidations=0,fail=false;
 const store={async transaction(_id,work){const staged=new Map(records);let changes=0;
  const result=await work({existing:async id=>staged.get(id)??null,available:async()=>active,
   insert:async note=>staged.set(note.id,note),invalidate:async()=>{if(fail)throw new Error("SYNTHETIC_PRIVATE_FAILURE");changes++;}});
  records.clear();for(const [id,note]of staged)records.set(id,note);invalidations+=changes;return result;}};
 return {store,records,setActive:value=>active=value,setFail:value=>fail=value,invalidations:()=>invalidations};}
test("authored note stores exact words once; replay after archival does not reactivate or invalidate",async()=>{
 const data=setup(),first=await createUserNote(input,data.store);assert.equal(first.note.body,input.body);assert.equal(first.replayed,false);
 data.setActive(false);const replay=await createUserNote(input,data.store);assert.equal(replay.note.id,first.note.id);assert.equal(replay.replayed,true);
 assert.equal(data.records.size,1);assert.equal(data.invalidations(),1);
});
test("changed retries, missing/archived people and invalid text cannot commit",async()=>{
 const data=setup();await createUserNote(input,data.store);
 await assert.rejects(createUserNote({...input,body:"Changed words"},data.store),/REQUEST_CONFLICT/);
 data.setActive(false);await assert.rejects(createUserNote({...input,requestId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc"},data.store),/PERSON_UNAVAILABLE/);
 for(const body of ["", " ","x".repeat(20001),"bad\0","bad\ud800"])
  await assert.rejects(createUserNote({...input,body},data.store));
 assert.equal(data.records.size,1);
});
test("failed invalidation rolls back note insertion",async()=>{
 const data=setup();data.setFail(true);await assert.rejects(createUserNote(input,data.store),/PRIVATE_FAILURE/);assert.equal(data.records.size,0);
});
function request(body=input,options={}){return new Request("https://example.test/api/notes",{method:"POST",headers:{origin:"https://example.test","content-type":"application/json",...options.headers},body:options.raw??JSON.stringify(body)});}
test("note HTTP boundary authorizes before parsing and returns private failures",async()=>{
 const data=setup();for(const authorize of [async()=>false,async()=>{throw new Error("PRIVATE_AUTH");}]){
  const response=await userNoteHandler(data.store,{origin:"https://example.test",authorize})(request({}, {raw:"bad"}));
  assert.ok([401,503].includes(response.status));assert.equal((await response.text()).includes("PRIVATE"),false);
 }assert.equal(data.records.size,0);
});
test("HTTP creation requires exact origin, bounded JSON, strict UUID envelope and fixed text; retries return 200",async()=>{
 const data=setup(),handler=userNoteHandler(data.store,{origin:"https://example.test",authorize:async()=>true});
 for(const [body,options,status]of [[input,{headers:{origin:"null"}},403],[input,{headers:{"content-type":"text/plain"}},415],
  [input,{raw:"x".repeat(124001)},413],[{...input,permission:"write"},{},400],[{personId:person,body:"Missing request ID"},{},400]])
  assert.equal((await handler(request(body,options))).status,status);
 const first=await handler(request());assert.equal(first.status,201);assert.equal((await first.json()).body,input.body);
 assert.equal((await handler(request())).status,200);assert.equal(data.records.size,1);
});
