import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const b=await build({entryPoints:['lib/relationships/profile-policy.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {eligibleProfileProofs,profileEdgeView}=await import(`data:text/javascript;base64,${Buffer.from(b.outputFiles[0].contents).toString('base64')}`);
const proof=(id='proof',personId='person',snapshotId='capture')=>({observationId:id,personId,snapshotId,encounterId:'encounter',layer:'user',originKey:'identity-confirmation:fixture',noticedPeople:[personId]});
const edge={id:'edge',personId:'person',state:'active'},support={relationshipId:'edge',proofId:'proof',snapshotId:'capture',personId:'person',assertionId:'assertion'};
test('a profile relationship requires an exact current owner proof and matching supporting capture',()=>{
 assert.equal(profileEdgeView(edge,[proof()],[support]).state,'supported');
 for(const change of [{proofId:'other'},{snapshotId:'different'},{personId:'other'},{relationshipId:'other'}])assert.equal(profileEdgeView(edge,[proof()],[{...support,...change}]).state,'historical');
 for(const change of [{layer:'source'},{originKey:'legacy'},{noticedPeople:[]}])assert.equal(profileEdgeView(edge,[{...proof(),...change}],[support]).state,'historical');
});
test('ambiguous proofs or multiple noticed people cannot provide a supported identity relationship',()=>{
 assert.deepEqual(eligibleProfileProofs([proof(),proof('second')]),[]);
 assert.deepEqual(eligibleProfileProofs([{...proof(),noticedPeople:['person','other']}]),[]);
 assert.equal(profileEdgeView(edge,[proof(),proof('second')],[support]).state,'historical');
});
test('different capture identities for one source remain a conflict rather than choosing a current Person',()=>{
 assert.equal(profileEdgeView(edge,[proof(),proof('second','other','other-capture')],[support]).state,'conflict');
 const same=proof('second','person','other-capture');assert.equal(profileEdgeView(edge,[proof(),same],[support]).state,'supported');
});
test('rejected links stay rejected, candidates stay candidates and lost support becomes historical',()=>{
 assert.equal(profileEdgeView({...edge,state:'rejected'},[proof()],[support]).state,'rejected');
 assert.equal(profileEdgeView({...edge,state:'candidate'},[proof()],[support]).state,'candidate');
 assert.equal(profileEdgeView(edge,[],[support]).state,'historical');
});
test('repeated captures retain independently inspectable proofs and Encounters',()=>{
 const next={...proof('next','person','next-capture'),encounterId:'next-encounter'};
 const view=profileEdgeView(edge,[proof(),next],[support,{...support,proofId:'next',snapshotId:'next-capture',assertionId:'next-assertion'}]);
 assert.equal(view.support.length,2);assert.deepEqual(view.support.map(row=>row.encounterId),['encounter','next-encounter']);
});
