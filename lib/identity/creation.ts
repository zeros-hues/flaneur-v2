import { z } from "zod";
import { migrationId } from "../migration/identity";
import { parseFingerprint } from "../processing/parse-input";
import type { IdentityProof, IdentityTransaction } from "./confirmation";

export const personCreationInput = z.object({ requestId: z.uuid(), snapshotId: z.uuid(),
  name: z.string().trim().min(1).max(200).refine(value=>!/[\u0000-\u001f\u007f]/u.test(value) &&
    !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)),
}).strict();
export interface PersonCreationReceipt { proof:IdentityProof; name:string }
export interface PersonCreationTransaction extends IdentityTransaction {
  creationReceipt(requestId:string):Promise<PersonCreationReceipt|null>;
  sourceNeutralPeople():Promise<boolean>;
  createPerson(id:string,name:string):Promise<void>;
}
export interface PersonCreationStore {
  transaction<T>(snapshotId:string,work:(tx:PersonCreationTransaction)=>Promise<T>):Promise<T>;
}
/** Explicit owner creation only; names/URLs are never used as deduplication or automatic identity proof. */
export async function createPersonFromProfile(raw:unknown,store:PersonCreationStore){
 const parsed=personCreationInput.parse(raw),input={...parsed,requestId:parsed.requestId.toLowerCase(),snapshotId:parsed.snapshotId.toLowerCase()};
 return store.transaction(input.snapshotId,async tx=>{
  const receipt=await tx.creationReceipt(input.requestId);
  if(receipt){
   if(receipt.proof.snapshotId!==input.snapshotId||receipt.name!==input.name)throw new Error('IDENTITY_REQUEST_CONFLICT');
   return {proof:receipt.proof,replayed:true};
  }
  if(!await tx.sourceNeutralPeople())throw new Error('PERSON_CREATION_NOT_READY');
  const snapshot=await tx.snapshot();
  if(!snapshot||snapshot.kind!=='profile_page'||snapshot.adapterId!=='linkedin')throw new Error('IDENTITY_SNAPSHOT_UNSUPPORTED');
  if(await tx.currentProof()||(await tx.noticedPeople()).length)throw new Error('IDENTITY_REASSIGNMENT_REQUIRES_REVIEW');
  const proof:IdentityProof={id:migrationId(`identity-confirmation:${input.requestId}`),snapshotId:input.snapshotId,
   personId:migrationId(`person-creation:${input.requestId}`),supersedesId:null};
  await tx.createPerson(proof.personId,input.name);
  await tx.insertProof(proof,input.requestId,{name:input.name});
  await tx.linkPerson(proof.personId);
  await tx.queueParse(parseFingerprint({...snapshot,identityObservationId:proof.id}));
  return {proof,replayed:false};
 });
}
