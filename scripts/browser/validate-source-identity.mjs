import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const WebSocket=createRequire(import.meta.url)('next/dist/compiled/ws');
// Isolated real UI and browser; synthetic APIs only. Does not load .env or sign in.
const cache=resolve('node_modules/.cache/flaneur');mkdirSync(cache,{recursive:true});
const profile=mkdtempSync(join(cache,'source-identity-browser-'));
const snapshot=randomUUID(),people=[randomUUID(),randomUUID()],proof=randomUUID();
const artifact=randomUUID(),relationship=randomUUID(),relationshipCursor=randomUUID(),supportEncounter=randomUUID();
let relationshipStatus='supported',failRelationships=false;const relationshipReads=[];
let stage='build',server,browser,ws,sequence=0,checks=0,associated=false,available=true,supported=true,lostAck=true;
let creationReady=false,createdPerson=null,createdName='',loseCreation=true;
let reassignedTo=null,currentProof=proof,currentDecision=null,loseReassignment=true;
let authorshipAvailable=true,failAuthorship=false,loseAuthorshipAck=true;const authorRequests=[],authorAssertions=[],authorReceipts=new Map();
let authorPanelStatus='owner-confirmed',failAuthorPanel=false,wrongAuthorPanel=false;const authorPanelReads=[];
const queryProfileArtifact=randomUUID(),queryProfileSnapshot=randomUUID();
const reviewedConcept=randomUUID(),conceptHistoryCursor=randomUUID(),conceptEdge=randomUUID(),conceptRequests=[],conceptReceipts=new Map(),conceptReads=[];
let conceptAvailable=true,failConceptRead=false,loseConceptAck=true,conceptProof=null,conceptWithdrawal=null;
const relationshipMemory={type:'memory',mode:'recall',interpretation:'Synthetic relationship recall',state:'matches',questions:[],matchedTotal:2,uncertainTotal:0,evaluated:2,
 items:['authored_by','profile_of'].map((predicate,index)=>({id:index?queryProfileArtifact:artifact,kind:'artifact',label:index?'Saved profile':'Saved post',uncertain:false,
  evidence:[{id:`query-${predicate}`,objectId:index?queryProfileArtifact:artifact,text:index?'Confirmed the captured profile association.':'Exact reviewed authorship reason.',layer:'user',verified:true,filterOnly:true,
   provenance:{snapshotId:index?queryProfileSnapshot:snapshot,encounterId:supportEncounter,relationship:{id:relationship,predicate,personId:people[0]}}}]}))};
const associatedPerson=()=>reassignedTo??createdPerson??people[1];
const associatedName=()=>reassignedTo?'Synthetic Ada':createdName||'Synthetic Ada';
const pending=new Map(),requests=[],receipts=new Map(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function capture(person){return {snapshotId:snapshot,sourceUrl:'https://example.test/synthetic-profile',capturedAt:'2026-10-17T00:00:00Z',
 state:associated?(person===associatedPerson()?'associated':'conflict'):'unresolved',
 proof:associated?{id:currentProof,personId:associatedPerson(),layer:'user',bodyText:'Synthetic profile identity confirmation',reassignment:currentDecision}:null,
 actions:{confirm:available&&(!associated||person===associatedPerson()),reject:associated&&person===associatedPerson()}};}
function page(q){return {snapshotId:snapshot,supported,available,
 canCreatePerson:creationReady&&available&&!associated,
 reassignment:associated&&available?{fromObservationId:currentProof,fromPersonId:associatedPerson(),fromName:associatedName()}:null,
 associations:associated?[{id:associatedPerson(),name:associatedName(),inactive:false,capture:capture(associatedPerson())}]:[],
 people:q?people.map(id=>({id,name:'Synthetic Ada',capture:capture(id)})):[],nextCursor:null};}
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP_TIMEOUT'));},10000);
 pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error('BROWSER_EVALUATION_FAILED');return result.result.value;}
async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(100);}throw new Error('BROWSER_CONDITION_TIMEOUT');}
async function click(label,index=0){assert.equal(await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].filter(b=>b.textContent===${JSON.stringify(label)}&&!b.disabled)[${index}];if(!button)return false;button.click();return true;})()`),true);}
try{
 const output=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {SourceIdentityReview} from './components/inspection/SourceIdentityReview';import {ProfileRelationships} from './components/inspection/ProfileRelationships';import {SourceAuthorshipReview} from './components/inspection/SourceAuthorshipReview';import {AuthorshipRelationships} from './components/inspection/AuthorshipRelationships';import {MemoryBlock} from './components/query/MemoryBlock';import {ConceptRelationships} from './components/inspection/ConceptRelationships';createRoot(document.getElementById('root')).render(<><SourceIdentityReview snapshotId="${snapshot}"/><ProfileRelationships kind="artifact" id="${artifact}"/><SourceAuthorshipReview snapshotId="${snapshot}"/><AuthorshipRelationships kind="artifact" id="${artifact}"/><AuthorshipRelationships kind="person" id="${people[0]}"/><ConceptRelationships kind="artifact" id="${artifact}"/><ConceptRelationships kind="concept" id="${reviewedConcept}"/></>);window.renderRelationshipMemory=()=>{const host=document.createElement('div');host.id='relationship-memory-fixture';document.body.appendChild(host);createRoot(host).render(<MemoryBlock block={${JSON.stringify(relationshipMemory)}} at={0}/>);};`,resolveDir:resolve('.'),loader:'tsx'},
  bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent',plugins:[{
   name:'fixture-link',setup(plugin){plugin.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
    plugin.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'import React from "react";export default function Link(props){return <a {...props}/>}',loader:'jsx',resolveDir:resolve('.')}));}
  }]});const js=output.outputFiles[0].text;
 server=createServer(async(req,res)=>{
  res.setHeader('cache-control','no-store');
  if(req.url.startsWith('/api/concept-associations/')){
   conceptReads.push(req.url);res.setHeader('content-type','application/json');if(failConceptRead){res.statusCode=503;return res.end('{}');}
   const params=new URL(req.url,'http://fixture').searchParams,kind=req.url.includes('/concept/')?'concept':'artifact',id=kind==='concept'?reviewedConcept:artifact;
   const current=conceptAvailable&&!!conceptProof&&!conceptWithdrawal,historyPage=params.has('historyCursor');
   return res.end(JSON.stringify({kind,id,available:conceptAvailable,items:conceptProof&&!params.has('cursor')?[{id:conceptEdge,subjectId:artifact,subjectKind:'artifact',subjectLabel:'Synthetic saved post',
    conceptId:reviewedConcept,conceptLabel:'Correspondence',conceptKind:'concept',status:current?'owner-reviewed':'historical',supportCount:current?1:0,historyCount:21,
    history:[{id:historyPage?'earlier-fixture':conceptProof.id,reason:historyPage?'Earlier preserved interpretation.':conceptProof.reason,
     current:!historyPage&&current,withdrawable:!historyPage&&current,conceptAtDecision:{label:'Correspondence',kind:'concept'},withdrawalReason:historyPage?null:conceptWithdrawal}],
    nextHistoryCursor:historyPage?null:conceptHistoryCursor}]:[],nextCursor:params.has('cursor')||params.has('historyEdge')?null:relationshipCursor,
    concepts:params.has('q')&&kind!=='concept'&&conceptAvailable?[{id:reviewedConcept,label:'Correspondence',kind:'concept'}]:[],nextSearchCursor:null}));
  }
  if(req.url.startsWith('/api/authorship/')){
   authorPanelReads.push(req.url);res.setHeader('content-type','application/json');if(failAuthorPanel){res.statusCode=503;return res.end('{}');}
   const kind=req.url.includes('/person/')?'person':'artifact',id=kind==='person'?people[0]:artifact;
   const next=new URL(req.url,'http://fixture').searchParams.has('cursor'),current=['owner-confirmed','candidate'].includes(authorPanelStatus);
   return res.end(JSON.stringify({kind,id:wrongAuthorPanel?randomUUID():id,items:next?[]:[{id:relationship,artifactId:artifact,personId:people[0],personName:'Synthetic Ada',
    sourceLabel:'Synthetic saved post',state:'active',status:authorPanelStatus,supportCount:current?1:0,historyCount:21,
    history:[{id:'panel-fixture-proof',snapshotId:snapshot,encounterId:current?supportEncounter:null,current,reason:'Exact owner authorship reason.',withdrawalReason:current?null:'Withdrawn after source review.'}]}],nextCursor:next?null:relationshipCursor}));
  }
  if(req.url.startsWith(`/api/relationships/artifact/${artifact}`)){
   relationshipReads.push(req.url);res.setHeader('content-type','application/json');if(failRelationships){res.statusCode=503;return res.end('{"error":"fixture_unavailable"}');}
   const next=new URL(req.url,'http://fixture').searchParams.has('cursor');
   return res.end(JSON.stringify({kind:'artifact',id:artifact,items:next?[]:[{id:relationship,artifactId:artifact,personId:people[0],state:'active',status:relationshipStatus,
    personName:'Synthetic Ada',sourceLabel:'Synthetic profile source',supportCount:relationshipStatus==='historical'?0:1,
    support:relationshipStatus==='historical'?[]:[{proofId:currentProof,snapshotId:snapshot,encounterId:supportEncounter,assertionId:'fixture-assertion'}]}],nextCursor:next?null:relationshipCursor}));
  }
  if(req.url.startsWith(`/api/snapshot/${snapshot}/identity`)){res.setHeader('content-type','application/json');return res.end(JSON.stringify(page(new URL(req.url,'http://fixture').searchParams.get('q'))));}
  if(req.url.startsWith(`/api/snapshot/${snapshot}/authorship`)){
   res.setHeader('content-type','application/json');if(failAuthorship){res.statusCode=503;return res.end('{}');}
   return res.end(JSON.stringify({snapshotId:snapshot,artifactId:artifact,supported:true,available:authorshipAvailable,assertions:authorAssertions,
    people:new URL(req.url,'http://fixture').searchParams.has('q')?[{id:people[0],name:'Synthetic Ada'}]:[],nextCursor:null}));
  }
  if(req.url==='/api/review'){
   res.setHeader('content-type','application/json');let text='';for await(const chunk of req)text+=chunk;
   const input=JSON.parse(text);requests.push(input);
   if(input.action==='review_concept_association'){
    conceptRequests.push(input);const payload=input.payload;
    if(!conceptReceipts.has(payload.requestId)){
     const receipt={requestId:payload.requestId,subjectId:payload.subjectId,conceptId:payload.conceptId,observationId:payload.observationId??randomUUID()};conceptReceipts.set(payload.requestId,receipt);
     if(payload.decision==='confirm'){conceptProof={id:receipt.observationId,reason:payload.reason};conceptWithdrawal=null;}else conceptWithdrawal=payload.reason;
    }
    if(loseConceptAck){loseConceptAck=false;res.statusCode=503;return res.end('{}');}
    return res.end(JSON.stringify(conceptReceipts.get(payload.requestId)));
   }
   if(input.action==='review_authorship'){
    authorRequests.push(input);const payload=input.payload;
    if(!authorReceipts.has(payload.requestId)){
     const receipt={requestId:payload.requestId,snapshotId:snapshot,personId:payload.personId,observationId:payload.observationId??randomUUID()};
     authorReceipts.set(payload.requestId,receipt);
     if(payload.decision==='confirm')authorAssertions.push({id:receipt.observationId,personId:payload.personId,name:'Synthetic Ada',snapshotId:snapshot,
      encounterId:supportEncounter,status:'owner-confirmed',reason:payload.reason,canReject:true});
     else{const row=authorAssertions.find(row=>row.id===payload.observationId);row.status='historical';row.canReject=false;row.withdrawalReason=payload.reason;}
    }
    if(loseAuthorshipAck){loseAuthorshipAck=false;res.statusCode=503;return res.end('{}');}
    return res.end(JSON.stringify(authorReceipts.get(payload.requestId)));
   }
   if(!receipts.has(input.payload.requestId)){receipts.set(input.payload.requestId,input);associated=['confirm_identity','create_person_from_profile','reassign_identity'].includes(input.action);
    if(input.action==='create_person_from_profile'){createdPerson=randomUUID();createdName=input.payload.name;}
    if(input.action==='reassign_identity'){reassignedTo=input.payload.personId;currentProof=randomUUID();currentDecision=input.payload;}}
   if(lostAck&&input.action==='confirm_identity'){lostAck=false;res.statusCode=503;return res.end('{"error":"synthetic_lost_ack"}');}
   if(loseCreation&&input.action==='create_person_from_profile'){loseCreation=false;res.statusCode=503;return res.end('{"error":"synthetic_lost_creation_ack"}');}
   if(loseReassignment&&input.action==='reassign_identity'){loseReassignment=false;res.statusCode=503;return res.end('{"error":"synthetic_lost_reassignment_ack"}');}
   return res.end(JSON.stringify({replayed:requests.length>1,proof:{id:currentProof,snapshotId:snapshot,personId:associatedPerson()}}));
  }
  if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');return res.end(js);}
  res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;margin:20px}button,input{font:inherit;max-width:100%}li{margin-block:16px}.textlink{margin:8px}p{overflow-wrap:anywhere}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const executable=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);assert.ok(executable);
 stage='launch';browser=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});browser.on('error',()=>{});
 const portFile=join(profile,'DevToolsActivePort');for(let i=0;i<150&&!existsSync(portFile);i++)await sleep(100);assert.ok(existsSync(portFile));
 const port=readFileSync(portFile,'utf8').split('\n')[0],tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{const data=JSON.parse(event.data),promise=pending.get(data.id);if(!promise)return;pending.delete(data.id);data.error?promise.reject(new Error('CDP_ERROR')):promise.resolve(data.result);});
 await call('Page.enable');await call('Runtime.enable');await call('Page.navigate',{url:origin});
 await until("document.body.innerText.includes('review person association')");assert.equal(requests.length,0);checks++;
 stage='explicit_name_search';await click('review person association');await until("!!document.querySelector('input')");
 assert.equal(await evaluate("document.querySelectorAll('li').length"),0);checks++;
 await evaluate("document.querySelector('input').focus()");await call('Input.insertText',{text:'Ada'});await click('search people');
 await until("document.querySelectorAll('li').length===2");assert.equal(requests.length,0);checks++;
 assert.equal(await evaluate("!!document.querySelector('#new-source-person-name')"),false);checks++;
 stage='explicit_selection';await click('select this person',1);assert.equal(requests.length,0);checks++;
 await click('confirm person association');await until("document.body.innerText.includes('Confirm that this captured profile belongs to Synthetic Ada?')");assert.equal(requests.length,0);checks++;
 stage='lost_ack_retry';await click('confirm identity');await until("document.body.innerText.includes('Retry uses the same decision.')");
 assert.equal(requests[0].payload.personId,people[1]);assert.equal(requests[0].payload.snapshotId,snapshot);checks+=2;
 await click('retry decision');await until("document.body.innerText.includes('A current identity assertion is recorded.')");
 assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);checks+=2;
 assert.equal(await evaluate("document.body.innerText.includes('This person conflicts with recorded associations.')"),true);checks++;
 stage='reject_current_association';await click('reject association');assert.equal(requests.length,2);checks++;
 await click('reject identity');await until("!document.body.innerText.includes('A current identity assertion is recorded.')");
 assert.equal(requests[2].action,'reject_identity');assert.equal(requests[2].payload.observationId,proof);checks+=2;
 stage='inactive_source';available=false;await click('refresh associations');await until("document.body.innerText.includes('inactive or unavailable')");
 assert.equal(await evaluate("!!document.querySelector('form')"),false);checks++;
 stage='unsupported_source';supported=false;await click('refresh associations');await until("document.body.innerText.includes('not a supported captured profile')");
 assert.equal(await evaluate("!!document.querySelector('form')"),false);checks++;
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true);checks++;
 // A fresh synthetic unresolved-capture scenario with the proposed schema ready.
 stage='create_separate_person';supported=true;available=true;associated=false;creationReady=true;requests.length=0;receipts.clear();
 await call('Page.navigate',{url:origin});await until("document.body.innerText.includes('review person association')");
 await click('review person association');await until("!!document.querySelector('#source-person-search')");
 assert.equal(await evaluate("!!document.querySelector('#new-source-person-name')"),false);checks++;
 await evaluate("document.querySelector('#source-person-search').focus()");await call('Input.insertText',{text:'Ada'});await click('search people');
 await until("!!document.querySelector('#new-source-person-name')");
 await evaluate("document.querySelector('#new-source-person-name').focus();document.querySelector('#new-source-person-name').select()");
 await call('Input.insertText',{text:'New person 😀'});await click('review new person');
 assert.equal(requests.length,0);checks++;
 await click('cancel creation');assert.equal(requests.length,0);checks++;
 await click('review new person');await click('create person and confirm');
 await until("document.body.innerText.includes('Retry uses the same decision.')");
 assert.equal(requests[0].payload.name,'New person 😀');assert.equal(requests[0].payload.personId,undefined);checks+=2;
 await click('retry creation');await until("document.body.innerText.includes('A current identity assertion is recorded.')");
 assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);checks+=2;
 assert.equal(await evaluate("!!document.querySelector('#new-source-person-name')"),false);checks++;
 assert.equal(await evaluate("document.body.innerText.includes('New person 😀')"),true);checks++;
 stage='reviewed_reassignment';requests.length=0;
 await click('select replacement person',0);await until("!!document.querySelector('textarea')");
 assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='review reassignment').disabled"),true);checks++;
 const reason='  Correct person 😀\n  ',priorProof=currentProof,priorPerson=associatedPerson();
 await evaluate("document.querySelector('textarea').focus()");await call('Input.insertText',{text:reason});await click('review reassignment');
 assert.equal(requests.length,0);checks++;
 await click('cancel reassignment');assert.equal(requests.length,0);checks++;
 await click('review reassignment');await click('confirm reassignment');await until("document.body.innerText.includes('Retry uses the same decision.')");
 assert.equal(requests[0].payload.reason,reason);assert.equal(requests[0].payload.fromObservationId,priorProof);assert.equal(requests[0].payload.fromPersonId,priorPerson);checks+=3;
 assert.equal(requests[0].payload.personId,people[0]);checks++;
 await click('retry reassignment');await until("document.body.innerText.includes('Your reason for reassignment')");
 assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);checks+=2;
 assert.equal(await evaluate("document.body.innerText.includes('Correct person 😀')"),true);checks++;
 assert.equal(await evaluate(`!!document.querySelector('a[href="/person/${priorPerson}"]')`),true);checks++;
 stage='profile_relationship_inspection';const writesBefore=requests.length;
 assert.equal(relationshipReads.length,0);checks++;
 await click('inspect profile relationships');await until("document.body.innerText.includes('Supported by current owner confirmations.')");
 assert.equal(requests.length,writesBefore);checks++;
 assert.equal(await evaluate(`!!document.querySelector('section[aria-label="Reviewed profile relationships"] a[href="/snapshot/${snapshot}"]')`),true);checks++;
 assert.equal(await evaluate(`!!document.querySelector('section[aria-label="Reviewed profile relationships"] a[href="/encounter/${supportEncounter}"]')`),true);checks++;
 relationshipStatus='conflict';await click('first relationships / refresh');await until("document.body.innerText.includes('Different current capture associations remain unresolved.')");
 assert.equal(await evaluate("document.body.innerText.includes('Supported by current owner confirmations.')"),false);checks++;
 relationshipStatus='historical';await click('first relationships / refresh');await until("document.body.innerText.includes('Historical link; current support is unavailable.')");
 assert.equal(await evaluate("[...document.querySelectorAll('section[aria-label=\"Reviewed profile relationships\"] a')].some(a=>a.textContent==='inspect supporting capture')"),false);checks++;
 await click('next relationships');await until("document.body.innerText.includes('No reviewed profile relationships are recorded on this page.')");
 assert.ok(relationshipReads.at(-1).includes('cursor='));checks++;
 failRelationships=true;await click('first relationships / refresh');await until("document.body.innerText.includes('Profile relationships could not be loaded.')");
 assert.equal(await evaluate("!![...document.querySelectorAll('button')].find(b=>b.textContent==='inspect profile relationships')"),true);checks++;
 stage='explicit_post_authorship';await click('review post authorship');await until("!!document.querySelector('#post-author-search')");
 assert.equal(authorRequests.length,0);assert.equal(await evaluate("[...document.querySelectorAll('button')].filter(b=>b.textContent==='select author').length"),0);checks+=2;
 await evaluate("document.querySelector('#post-author-search').focus()");await call('Input.insertText',{text:'Ada'});await click('search authors');
 await until("[...document.querySelectorAll('button')].some(b=>b.textContent==='select author')");await click('select author');
 assert.equal(authorRequests.length,0);checks++;
 const authorshipReason='  Reviewed exact post 🦋\n  ';
 await evaluate("document.querySelector('#post-authorship-reason').focus()");await call('Input.insertText',{text:authorshipReason});await click('review authorship decision');
 assert.equal(authorRequests.length,0);checks++;
 await click('cancel authorship decision');assert.equal(authorRequests.length,0);checks++;
 await click('select author');await evaluate("document.querySelector('#post-authorship-reason').focus()");await call('Input.insertText',{text:authorshipReason});
 await click('review authorship decision');await click('save authorship decision');await until("document.body.innerText.includes('Authorship could not be confirmed. Retry uses the same decision.')");
 assert.equal(authorRequests[0].payload.reason,authorshipReason);assert.equal(authorRequests[0].payload.name,undefined);checks+=2;
 await click('save authorship decision');await until("document.body.innerText.includes('owner-confirmed')");
 assert.equal(authorRequests.length,2);assert.deepEqual(authorRequests[0],authorRequests[1]);checks+=2;
 assert.equal(await evaluate(`!!document.querySelector('section[aria-label="Post authorship review"] a[href="/snapshot/${snapshot}"]')`),true);checks++;
 await click('withdraw this authorship decision');await evaluate("document.querySelector('#post-authorship-reason').focus()");await call('Input.insertText',{text:'Withdraw after review.'});
 await click('review authorship decision');assert.equal(authorRequests.length,2);checks++;
 await click('save authorship decision');await until("document.querySelector('section[aria-label=\"Post authorship review\"]').innerText.includes('historical')");
 assert.equal(authorRequests[2].payload.decision,'reject');assert.equal(authorRequests[2].payload.observationId,authorReceipts.get(authorRequests[0].payload.requestId).observationId);checks+=2;
 assert.equal(await evaluate("document.body.innerText.includes('Reason for withdrawal: Withdraw after review.')"),true);checks++;
 authorshipAvailable=false;await click('refresh authorship');await until("document.body.innerText.includes('unavailable for new authorship decisions')");
 assert.equal(await evaluate("!!document.querySelector('#post-author-search')"),false);checks++;
 failAuthorship=true;await click('refresh authorship');await until("document.body.innerText.includes('Authorship review could not be loaded.')");
 assert.equal(await evaluate("document.querySelector('section[aria-label=\"Post authorship review\"]').innerText.includes('historical')"),false);checks++;
 assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true);checks++;
 stage='authorship_object_panels';const authorWritesBefore=requests.length;
 assert.equal(authorPanelReads.length,0);checks++;
 await click('inspect authorship relationships',0);await until("document.querySelectorAll('section[aria-label=\"Reviewed authorship relationships\"]')[0].innerText.includes('Owner-confirmed authorship with current support.')");
 assert.ok(authorPanelReads.at(-1).startsWith(`/api/authorship/artifact/${artifact}`));checks++;
 assert.equal(await evaluate(`!!document.querySelector('section[aria-label="Reviewed authorship relationships"] a[href="/snapshot/${snapshot}"]')`),true);checks++;
 assert.equal(await evaluate(`!!document.querySelector('section[aria-label="Reviewed authorship relationships"] a[href="/encounter/${supportEncounter}"]')`),true);checks++;
 assert.equal(await evaluate("document.body.innerText.includes('Showing 1 of 21 decisions.')"),true);checks++;
 await click('inspect authorship relationships',0);await until("document.querySelectorAll('section[aria-label=\"Reviewed authorship relationships\"]')[1].innerText.includes('Owner-confirmed authorship with current support.')");
 assert.ok(authorPanelReads.at(-1).startsWith(`/api/authorship/person/${people[0]}`));checks++;
 assert.equal(requests.length,authorWritesBefore);checks++;
 authorPanelStatus='historical';await click('first authorship relationships / refresh',0);
 await until("document.querySelectorAll('section[aria-label=\"Reviewed authorship relationships\"]')[0].innerText.includes('Historical authorship; current support is unavailable.')");
 assert.equal(await evaluate("document.querySelectorAll('section[aria-label=\"Reviewed authorship relationships\"]')[0].innerText.includes('Reason for withdrawal: Withdrawn after source review.')"),true);checks++;
 assert.equal(await evaluate("!!document.querySelectorAll('section[aria-label=\"Reviewed authorship relationships\"]')[0].querySelector('a[href^=\"/encounter/\"]')"),false);checks++;
 authorPanelStatus='candidate';await click('first authorship relationships / refresh',0);
 await until("document.body.innerText.includes('Candidate authorship; no active relationship is established.')");checks++;
 authorPanelStatus='rejected';await click('first authorship relationships / refresh',0);
 await until("document.body.innerText.includes('Rejected authorship relationship.')");
 assert.equal(await evaluate("document.querySelectorAll('section[aria-label=\"Reviewed authorship relationships\"]')[0].innerText.includes('0 current owner decisions.')"),true);checks++;
 await click('next authorship relationships',0);await until("document.body.innerText.includes('No reviewed authorship relationships are recorded on this page.')");
 assert.ok(authorPanelReads.at(-1).includes('cursor='));checks++;
 failAuthorPanel=true;await click('first authorship relationships / refresh',0);await until("document.body.innerText.includes('Authorship relationships could not be loaded.')");
 assert.equal(await evaluate("document.querySelectorAll('section[aria-label=\"Reviewed authorship relationships\"]')[0].innerText.includes('Rejected authorship relationship.')"),false);checks++;
 failAuthorPanel=false;wrongAuthorPanel=true;await click('inspect authorship relationships',0);
 await until("document.querySelectorAll('section[aria-label=\"Reviewed authorship relationships\"]')[0].innerText.includes('Authorship relationships could not be loaded.')");
 assert.equal(await evaluate("document.querySelectorAll('section[aria-label=\"Reviewed authorship relationships\"]')[0].innerText.includes('Synthetic saved post')"),false);checks++;
 assert.equal(requests.length,authorWritesBefore);assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true);checks+=2;
 stage='relationship_memory_labels';await evaluate('window.renderRelationshipMemory()');await until("!!document.querySelector('#relationship-memory-fixture .observation-evidence')");
 assert.equal(await evaluate("document.querySelector('#relationship-memory-fixture').innerText.includes('Your reviewed authorship decision — not independently verified')"),true);checks++;
 assert.equal(await evaluate("document.querySelector('#relationship-memory-fixture').innerText.includes('Your reviewed profile association — not independently verified')"),true);checks++;
 assert.equal(await evaluate(`document.querySelectorAll('#relationship-memory-fixture a[href="/person/${people[0]}"]').length`),2);checks++;
 assert.equal(await evaluate(`!!document.querySelector('#relationship-memory-fixture a[href="/snapshot/${snapshot}"]')`),true);checks++;
 assert.equal(await evaluate(`!!document.querySelector('#relationship-memory-fixture a[href="/snapshot/${queryProfileSnapshot}"]')`),true);checks++;
 assert.equal(await evaluate("document.querySelector('#relationship-memory-fixture').innerText.includes('Source text')"),false);checks++;
 assert.equal(requests.length,authorWritesBefore);checks++;
 stage='reviewed_concept_association';await click('inspect Concept relationships',0);await until(`!!document.querySelector('#concept-search-${artifact}')`);
 assert.equal(conceptRequests.length,0);assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='select Concept')"),false);checks+=2;
 await evaluate(`document.querySelector('#concept-search-${artifact}').focus()`);await call('Input.insertText',{text:'Correspond'});await click('search Concepts');
 await until("[...document.querySelectorAll('button')].some(b=>b.textContent==='select Concept')");await click('select Concept');assert.equal(conceptRequests.length,0);checks++;
 const conceptReason='  My idea association 🦋\n  ';await evaluate(`document.querySelector('#concept-reason-${artifact}').focus()`);await call('Input.insertText',{text:conceptReason});
 await click('review Concept decision');assert.equal(conceptRequests.length,0);checks++;await click('cancel Concept decision');assert.equal(conceptRequests.length,0);checks++;
 await click('select Concept');await evaluate(`document.querySelector('#concept-reason-${artifact}').focus()`);await call('Input.insertText',{text:conceptReason});await click('review Concept decision');
 await click('save Concept decision');await until("document.body.innerText.includes('The association could not be confirmed. Retry uses the same decision.')");
 assert.deepEqual(conceptRequests[0].payload.expectedConcept,{label:'Correspondence',kind:'concept'});assert.equal(conceptRequests[0].payload.reason,conceptReason);checks+=2;
 await click('save Concept decision');await until("document.body.innerText.includes('Current owner-reviewed interpretation.')");
 assert.equal(conceptRequests.length,2);assert.deepEqual(conceptRequests[0],conceptRequests[1]);checks+=2;
 await click('inspect Concept relationships',0);await until("document.querySelectorAll('section[aria-label=\"Reviewed Concept relationships\"]')[1].innerText.includes('Current owner-reviewed interpretation.')");
 assert.ok(conceptReads.at(-1).startsWith(`/api/concept-associations/concept/${reviewedConcept}`));checks++;
 assert.equal(await evaluate(`!!document.querySelectorAll('section[aria-label="Reviewed Concept relationships"]')[1].querySelector('a[href="/artifact/${artifact}"]')`),true);checks++;
 assert.equal(await evaluate("document.querySelectorAll('section[aria-label=\"Reviewed Concept relationships\"]')[1].querySelectorAll('input').length"),0);checks++;
 loseConceptAck=true;await click('withdraw Concept association',1);await evaluate(`document.querySelector('#concept-reason-${reviewedConcept}').focus()`);await call('Input.insertText',{text:'Withdraw this interpretation.'});
 await click('review Concept decision');assert.equal(conceptRequests.length,2);checks++;
 await click('save Concept decision');await until("document.body.innerText.includes('The association could not be confirmed. Retry uses the same decision.')");await click('save Concept decision');
 await until("document.body.innerText.includes('Reason for withdrawal: Withdraw this interpretation.')");assert.deepEqual(conceptRequests[2],conceptRequests[3]);checks++;
 assert.equal(conceptRequests[2].payload.subjectId,artifact);assert.equal(conceptRequests[2].payload.observationId,conceptProof.id);checks+=2;
 await click('first Concept relationships / refresh',0);await until("document.querySelectorAll('section[aria-label=\"Reviewed Concept relationships\"]')[0].innerText.includes('Historical association; current support is unavailable.')");
 assert.equal(await evaluate("document.querySelectorAll('section[aria-label=\"Reviewed Concept relationships\"]')[0].innerText.includes('Reason for withdrawal: Withdraw this interpretation.')"),true);checks++;
 await click('more Concept decisions',0);await until("document.body.innerText.includes('Earlier preserved interpretation.')");
 assert.ok(conceptReads.at(-1).includes('historyEdge='));assert.ok(conceptReads.at(-1).includes('historyCursor='));checks+=2;
 await click('first Concept relationships / refresh',0);await until("document.querySelectorAll('section[aria-label=\"Reviewed Concept relationships\"]')[0].innerText.includes('My idea association')");
 await click('next Concept relationships',0);await until("document.querySelectorAll('section[aria-label=\"Reviewed Concept relationships\"]')[0].innerText.includes('No reviewed Concept associations are recorded on this page.')");assert.ok(conceptReads.at(-1).includes('cursor='));checks++;
 failConceptRead=true;await click('first Concept relationships / refresh',0);await until("document.body.innerText.includes('Concept relationships could not be loaded.')");
 assert.equal(await evaluate("document.querySelectorAll('section[aria-label=\"Reviewed Concept relationships\"]')[0].innerText.includes('My idea association')"),false);checks++;
 failConceptRead=false;conceptAvailable=false;await click('inspect Concept relationships',0);await until("document.body.innerText.includes('This object is inactive.')");
 assert.equal(await evaluate(`!!document.querySelector('#concept-search-${artifact}')`),false);checks++;
 assert.equal(conceptRequests.length,4);assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true);checks+=2;
 console.log(JSON.stringify({status:'source_identity_browser_validation_passed',checks,synthetic_api:true,real_owner_login:false,real_database_used:false}));
}catch{console.error(JSON.stringify({status:'source_identity_browser_validation_failed',stage,completed_checks:checks}));process.exitCode=1;}
finally{
 if(ws?.readyState===WebSocket.OPEN)try{await call('Browser.close');}catch{}ws?.close();browser?.kill();
 for(const promise of pending.values())promise.reject(new Error('BROWSER_CLOSED'));pending.clear();
 if(server)await new Promise(resolve=>server.close(resolve));
 if(profile.startsWith(cache+sep)&&profile!==cache)for(let i=0;i<20;i++){try{rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(100);}}
}
