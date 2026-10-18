import type {CapturedIdentity} from './inspection';
/** A sole supported current association is reviewable; no guesses for rejected or conflicting history. */
export function reassignmentContext(capture:CapturedIdentity,people:{id:string;name:string;inactive:boolean}[]){
 if(!capture.available||capture.captureType!=='profile'||capture.adapterId!=='linkedin'||!capture.hasContentHash||
   capture.activeProofs.length!==1||capture.noticedPeople.length!==1)return null;
 const proof=capture.activeProofs[0]!,person=people.find(row=>row.id===proof.personId&&!row.inactive);
 if(!person||capture.noticedPeople[0]!==proof.personId)return null;
 return {fromObservationId:proof.id,fromPersonId:proof.personId,fromName:person.name};
}
