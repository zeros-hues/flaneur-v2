import { z } from "zod";
import { migrationId } from "../migration/identity";

export const authoredNoteText=z.string().max(20000).refine(value=>value.trim().length>0 && !value.includes("\0") &&
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value));
const schema=z.object({requestId:z.uuid(),personId:z.uuid(),body:authoredNoteText}).strict();
export interface UserNote {id:string;personId:string;body:string;originKey:string}
export interface UserNoteTransaction {
  existing(id:string):Promise<UserNote|null>;available(personId:string):Promise<boolean>;
  insert(note:UserNote):Promise<void>;invalidate(decisionId:string):Promise<void>;
}
export interface UserNoteStore {transaction<T>(personId:string,work:(tx:UserNoteTransaction)=>Promise<T>):Promise<T>}
/** Explicit authored note. Retry is historical; no legacy row is inserted/overwritten or silently migrated. */
export async function createUserNote(raw:unknown,store:UserNoteStore){
  const input=schema.parse(raw),originKey=`user-note:${input.requestId.toLowerCase()}`;
  const note:UserNote={id:migrationId(originKey),personId:input.personId.toLowerCase(),body:input.body,originKey};
  return store.transaction(note.personId,async tx=>{
    const prior=await tx.existing(note.id);
    if(prior){
      if(prior.personId!==note.personId || prior.body!==note.body || prior.originKey!==note.originKey)throw new Error("NOTE_REQUEST_CONFLICT");
      return {note:prior,replayed:true};
    }
    if(!await tx.available(note.personId))throw new Error("NOTE_PERSON_UNAVAILABLE");
    await tx.insert(note);await tx.invalidate(note.originKey);
    return {note,replayed:false};
  });
}
