import { and,eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { activePerson } from "@/lib/memory/eligibility";

/** Historical SQL-fixture compatibility only; no live route uses this in-place writer. */
export function legacyNoteStore(database: PostgresJsDatabase<typeof schema>) {
  return {
    create(personId:string,body:string) {
      return database.transaction(async tx=>{
        const [owner]=await tx.select({id:schema.objectRef.id}).from(schema.objectRef)
          .where(and(eq(schema.objectRef.id,personId),activePerson(schema.objectRef.id))).for("share");
        if(!owner)return null;
        const [row]=await tx.insert(schema.note).values({personId,body}).returning({id:schema.note.id,body:schema.note.body});
        return row??null;
      });
    },
    update(id:string,body:string) {
      return database.transaction(async tx=>{
        const [existing]=await tx.select({personId:schema.note.personId}).from(schema.note).where(eq(schema.note.id,id));
        if(!existing?.personId)return null;
        const [owner]=await tx.select({id:schema.objectRef.id}).from(schema.objectRef)
          .where(and(eq(schema.objectRef.id,existing.personId),activePerson(schema.objectRef.id))).for("share");
        if(!owner)return null;
        const [row]=await tx.update(schema.note).set({body}).where(and(eq(schema.note.id,id),eq(schema.note.personId,existing.personId)))
          .returning({id:schema.note.id,body:schema.note.body});
        return row??null;
      });
    },
  };
}
