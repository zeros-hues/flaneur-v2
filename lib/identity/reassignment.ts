import {z} from 'zod';
import {migrationId} from '../migration/identity';
import {parseFingerprint} from '../processing/parse-input';
import type {IdentityProof,IdentityTransaction} from './confirmation';

export const reassignmentInput=z.object({requestId:z.uuid(),snapshotId:z.uuid(),fromObservationId:z.uuid(),fromPersonId:z.uuid(),personId:z.uuid(),
 reason:z.string().max(2000).refine(value=>!!value.trim()&&!value.includes('\0')&&
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)),
}).strict().refine(input=>input.fromPersonId.toLowerCase()!==input.personId.toLowerCase());
export type IdentityReassignment=z.infer<typeof reassignmentInput>;
export interface ReassignmentReceipt {proof:IdentityProof;decision:IdentityReassignment}
export interface ReassignmentTransaction extends IdentityTransaction {
 receipt(requestId:string):Promise<ReassignmentReceipt|null>;
 insertReassignment(proof:IdentityProof,decision:IdentityReassignment):Promise<void>;
 replacePersonLink(fromPersonId:string,personId:string):Promise<void>;
}
export interface IdentityReassignmentStore {
 transaction<T>(snapshotId:string,people:string[],work:(tx:ReassignmentTransaction)=>Promise<T>):Promise<T>;
}
/** Owner explicitly reviews one current proof and its sole noticed-Person link; no bulk identity merge. */
export async function reassignProfileIdentity(raw:unknown,store:IdentityReassignmentStore){
 const parsed=reassignmentInput.parse(raw),input:IdentityReassignment={...parsed,
  requestId:parsed.requestId.toLowerCase(),snapshotId:parsed.snapshotId.toLowerCase(),
  fromObservationId:parsed.fromObservationId.toLowerCase(),fromPersonId:parsed.fromPersonId.toLowerCase(),personId:parsed.personId.toLowerCase()};
 return store.transaction(input.snapshotId,[input.fromPersonId,input.personId],async tx=>{
  const replay=await tx.receipt(input.requestId);
  if(replay){
   if((Object.keys(input) as (keyof IdentityReassignment)[]).some(key=>replay.decision[key]!==input[key]))throw new Error('IDENTITY_REQUEST_CONFLICT');
   return {proof:replay.proof,replayed:true};
  }
  const snapshot=await tx.snapshot();
  if(!snapshot||snapshot.kind!=='profile_page'||snapshot.adapterId!=='linkedin')throw new Error('IDENTITY_SNAPSHOT_UNSUPPORTED');
  if(!await tx.canonicalPerson(input.personId)||!await tx.canonicalPerson(input.fromPersonId))throw new Error('IDENTITY_PERSON_UNAVAILABLE');
  const current=await tx.currentProof(),noticed=await tx.noticedPeople();
  if(current?.id!==input.fromObservationId||current.personId!==input.fromPersonId||noticed.length!==1||noticed[0]!==input.fromPersonId)
   throw new Error('IDENTITY_REVIEW_STALE_OR_AMBIGUOUS');
  const proof:IdentityProof={id:migrationId(`identity-confirmation:${input.requestId}`),snapshotId:input.snapshotId,personId:input.personId,supersedesId:null};
  await tx.insertReassignment(proof,input);
  await tx.replacePersonLink(input.fromPersonId,input.personId);
  await tx.queueParse(parseFingerprint({...snapshot,identityObservationId:proof.id}));
  return {proof,replayed:false};
 });
}
