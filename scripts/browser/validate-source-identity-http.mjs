import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
// Built app, no owner login, synthetic configuration and unreachable fixture database only.
const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const fixtureDatabase='postgres://fixture:fixture@127.0.0.1:1/flaneur_fixture';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{
 stdio:['ignore','pipe','pipe'],env:{...process.env,DATABASE_URL:fixtureDatabase,DIRECT_URL:fixtureDatabase,CAPTURE_V2_ENABLED:'false',
 CAPTURE_SECRET:'source-review-http-fixture',OWNER_SESSION_ORIGIN:'https://flaneur.example',OWNER_PRINCIPAL_ID:randomUUID(),
 // Next's dotenv expansion also interpolates pre-existing values for keys present in .env.
 OWNER_PASSWORD_HASH:`flaneur-scrypt-v1$${Buffer.alloc(16,1).toString('base64url')}$${Buffer.alloc(32,2).toString('base64url')}`.replaceAll('$','\\$')}});
let checks=0,stage='startup',lastStatus=null;
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('START_TIMEOUT')),20000);
  child.stdout.on('data',chunk=>{if(String(chunk).includes('Ready')){clearTimeout(timer);resolve();}});child.stderr.on('data',()=>{});
  child.once('error',()=>{clearTimeout(timer);reject(new Error('START_FAILED'));});child.once('exit',()=>{clearTimeout(timer);reject(new Error('START_FAILED'));});});
 const base=`http://127.0.0.1:${port}`,id=randomUUID();
 for(const path of [`/api/snapshot/${id}/identity?q=Ada`,`/api/snapshot/invalid/identity?q=x`,`/api/snapshot/${id}/identity?q=Ada&q=Other`]){
  stage='unauthenticated_api';
  const response=await fetch(base+path,{headers:{'x-capture-secret':'source-review-http-fixture',cookie:'__Host-flaneur-session=invalid'}});
  lastStatus=response.status;
  assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'unauthorised'});
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');checks+=4;
 }
 const foreign=await fetch(`${base}/api/snapshot/${id}/identity`,{headers:{origin:'https://foreign.test'}});
 assert.equal(foreign.status,403);assert.deepEqual(await foreign.json(),{error:'origin_not_allowed'});checks+=2;
 const mutation=await fetch(`${base}/api/snapshot/${id}/identity`,{method:'POST'});
 assert.equal(mutation.status,405);await mutation.arrayBuffer();checks++;
 const page=await fetch(`${base}/snapshot/${id}`,{redirect:'manual'});
 assert.ok([303,307].includes(page.status));assert.equal(page.headers.get('location'),'/login');await page.arrayBuffer();checks+=2;
 // The review writer authenticates before checking Origin; both signed-out writes are denied first.
 stage='unauthenticated_person_creation';
 for(const [origin,status,error] of [['https://flaneur.example',401,'unauthorised'],['https://foreign.test',401,'unauthorised']]){
  const creation=await fetch(`${base}/api/review`,{method:'POST',headers:{origin,'content-type':'application/json','x-capture-secret':'source-review-http-fixture'},
   body:JSON.stringify({action:'create_person_from_profile',payload:{requestId:randomUUID(),snapshotId:id,name:'Synthetic created person'}})});
  lastStatus=creation.status;assert.equal(creation.status,status);assert.deepEqual(await creation.json(),{error});assert.equal(creation.headers.get('cache-control'),'no-store');
  assert.equal(creation.headers.get('x-content-type-options'),'nosniff');checks+=4;
 }
 stage='unauthenticated_identity_reassignment';
 const reassignment=await fetch(`${base}/api/review`,{method:'POST',headers:{origin:'https://flaneur.example','content-type':'application/json','x-capture-secret':'source-review-http-fixture'},
  body:JSON.stringify({action:'reassign_identity',payload:{requestId:randomUUID(),snapshotId:id,fromObservationId:randomUUID(),fromPersonId:randomUUID(),personId:randomUUID(),reason:'Synthetic correction'}})});
 assert.equal(reassignment.status,401);assert.deepEqual(await reassignment.json(),{error:'unauthorised'});
 assert.equal(reassignment.headers.get('cache-control'),'no-store');checks+=3;
 stage='unauthenticated_relationship_inspection';
 for(const path of [`/api/relationships/artifact/${id}`,`/api/relationships/invalid/not-a-uuid?cursor=bad`]){
  const response=await fetch(base+path,{headers:{'x-capture-secret':'source-review-http-fixture'}});
  assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'unauthorised'});
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');checks+=4;
 }
 const relationshipWrite=await fetch(`${base}/api/relationships/person/${id}`,{method:'POST'});assert.equal(relationshipWrite.status,405);await relationshipWrite.arrayBuffer();checks++;
 stage='unauthenticated_authorship';
 for(const path of [`/api/snapshot/${id}/authorship?q=Ada`,`/api/snapshot/not-a-uuid/authorship?q=Ada&q=Other`]){
  const response=await fetch(base+path,{headers:{'x-capture-secret':'source-review-http-fixture'}});
  assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'unauthorised'});
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');checks+=4;
 }
 const authorForeign=await fetch(`${base}/api/snapshot/${id}/authorship`,{headers:{origin:'https://foreign.test'}});
 assert.equal(authorForeign.status,403);assert.deepEqual(await authorForeign.json(),{error:'origin_not_allowed'});checks+=2;
 const authorMethod=await fetch(`${base}/api/snapshot/${id}/authorship`,{method:'POST'});assert.equal(authorMethod.status,405);await authorMethod.arrayBuffer();checks++;
 const authorWrite=await fetch(`${base}/api/review`,{method:'POST',headers:{origin:'https://flaneur.example','content-type':'application/json','x-capture-secret':'source-review-http-fixture'},
  body:JSON.stringify({action:'review_authorship',payload:{requestId:randomUUID(),snapshotId:id,personId:randomUUID(),decision:'confirm',reason:'Fixture only.'}})});
 assert.equal(authorWrite.status,401);assert.deepEqual(await authorWrite.json(),{error:'unauthorised'});
 assert.equal(authorWrite.headers.get('cache-control'),'no-store');assert.equal(authorWrite.headers.get('x-content-type-options'),'nosniff');checks+=4;
 stage='unauthenticated_authorship_panels';
 for(const path of [`/api/authorship/person/${id}`,`/api/authorship/artifact/${id}?cursor=${id}`,`/api/authorship/invalid/not-a-uuid?cursor=bad&cursor=other`]){
  const response=await fetch(base+path,{headers:{'x-capture-secret':'source-review-http-fixture'}});
  assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'unauthorised'});
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');checks+=4;
 }
 const panelForeign=await fetch(`${base}/api/authorship/person/${id}`,{headers:{origin:'https://foreign.test'}});
 assert.equal(panelForeign.status,403);assert.deepEqual(await panelForeign.json(),{error:'origin_not_allowed'});checks+=2;
 const panelWrite=await fetch(`${base}/api/authorship/artifact/${id}`,{method:'POST'});
 assert.equal(panelWrite.status,405);await panelWrite.arrayBuffer();checks++;
 stage='unauthenticated_concept_associations';
 for(const path of [`/api/concept-associations/person/${id}`,`/api/concept-associations/artifact/${id}?q=Idea`,`/api/concept-associations/invalid/not-a-uuid?historyCursor=bad&historyCursor=other`]){
  const response=await fetch(base+path,{headers:{'x-capture-secret':'source-review-http-fixture'}});
  assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'unauthorised'});
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');checks+=4;
 }
 const conceptForeign=await fetch(`${base}/api/concept-associations/concept/${id}`,{headers:{origin:'https://foreign.test'}});
 assert.equal(conceptForeign.status,403);assert.deepEqual(await conceptForeign.json(),{error:'origin_not_allowed'});checks+=2;
 const conceptMethod=await fetch(`${base}/api/concept-associations/artifact/${id}`,{method:'POST'});assert.equal(conceptMethod.status,405);await conceptMethod.arrayBuffer();checks++;
 const conceptWrite=await fetch(`${base}/api/review`,{method:'POST',headers:{origin:'https://flaneur.example','content-type':'application/json','x-capture-secret':'source-review-http-fixture'},
  body:JSON.stringify({action:'review_concept_association',payload:{requestId:randomUUID(),subjectId:id,conceptId:randomUUID(),decision:'confirm',expectedConcept:{label:'Idea',kind:'concept'},reason:'Fixture only.'}})});
 assert.equal(conceptWrite.status,401);assert.deepEqual(await conceptWrite.json(),{error:'unauthorised'});
 assert.equal(conceptWrite.headers.get('cache-control'),'no-store');assert.equal(conceptWrite.headers.get('x-content-type-options'),'nosniff');checks+=4;
 stage='career_authorisation';
 for(const path of [`/api/career/${id}`,`/api/career/not-a-uuid?q=x&q=y`]){
  const response=await fetch(base+path,{headers:{'x-capture-secret':'source-review-http-fixture'}});
  assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'unauthorised'});
  assert.equal(response.headers.get('cache-control'),'no-store');checks+=3;
 }
 const careerMethod=await fetch(`${base}/api/career/${id}`,{method:'POST'});assert.equal(careerMethod.status,405);await careerMethod.arrayBuffer();checks++;
 const careerForeign=await fetch(`${base}/api/career/${id}`,{headers:{origin:'https://foreign.test'}});assert.equal(careerForeign.status,403);await careerForeign.arrayBuffer();checks++;
 const careerWrite=await fetch(`${base}/api/review`,{method:'POST',headers:{origin:'https://flaneur.example','content-type':'application/json','x-capture-secret':'source-review-http-fixture'},body:JSON.stringify({action:'review_career',payload:{decision:'confirm'}})});
 assert.equal(careerWrite.status,401);assert.deepEqual(await careerWrite.json(),{error:'unauthorised'});checks+=2;
 stage='trajectory_authorisation';
 for(const path of [`/api/trajectory/${id}`,`/api/trajectory/not-a-uuid?q=x&q=y`]){
  const response=await fetch(base+path,{headers:{'x-capture-secret':'source-review-http-fixture'}});
  assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'unauthorised'});assert.equal(response.headers.get('cache-control'),'no-store');checks+=3;
 }
 const trajectoryMethod=await fetch(`${base}/api/trajectory/${id}`,{method:'POST'});assert.equal(trajectoryMethod.status,405);await trajectoryMethod.arrayBuffer();checks++;
 const trajectoryForeign=await fetch(`${base}/api/trajectory/${id}`,{headers:{origin:'https://foreign.test'}});assert.equal(trajectoryForeign.status,403);await trajectoryForeign.arrayBuffer();checks++;
 const trajectoryWrite=await fetch(`${base}/api/review`,{method:'POST',headers:{origin:'https://flaneur.example','content-type':'application/json','x-capture-secret':'source-review-http-fixture'},body:JSON.stringify({action:'review_trajectory',payload:{decision:'confirm'}})});
 assert.equal(trajectoryWrite.status,401);assert.deepEqual(await trajectoryWrite.json(),{error:'unauthorised'});checks+=2;
 console.log(JSON.stringify({status:'source_identity_http_validation_passed',checks,synthetic_configuration:true,real_owner_login:false,real_database_connected:false}));
}catch{console.error(JSON.stringify({status:'source_identity_http_validation_failed',stage,last_status:lastStatus,completed_checks:checks}));process.exitCode=1;}
finally{if(child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
