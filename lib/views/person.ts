// Earlier Person projections are displayed only as labelled historical context.
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { education, note, objectRef, organisation, person, role } from "@/db/schema";
import { db, sql as directSql } from "@/lib/db";
import { postgresUserNoteReader } from "@/lib/notes/postgres-read";

export async function loadPerson(id: string) {
  const [p] = await db.select({id:person.id,name:person.name,headline:person.headline,synthesis:person.synthesis,
    profileUrl:person.profileUrl,archivedAt:objectRef.archivedAt})
    .from(person).innerJoin(objectRef,eq(objectRef.id,person.id))
    .where(and(eq(person.id,id),eq(objectRef.kind,"person"),
      sql`not exists(select 1 from public.object_alias a where a.former_object_id=${person.id})`));
  if(!p)return null;
  const [notes,roles,schools,authoredNotes]=await Promise.all([
    db.select({id:note.id,body:note.body}).from(note).where(eq(note.personId,id)).orderBy(desc(note.createdAt)),
    db.select({id:role.id,title:role.title,company:organisation.displayName,startDate:role.startDate,
      startPrecision:role.startPrecision,endDate:role.endDate,endPrecision:role.endPrecision,isCurrent:role.isCurrent})
      .from(role).leftJoin(organisation,eq(role.organisationId,organisation.id)).where(eq(role.personId,id)).orderBy(asc(role.sortIndex)),
    db.select({id:education.id,school:education.school,degree:education.degree,fieldOfStudy:education.fieldOfStudy,
      startDate:education.startDate,startPrecision:education.startPrecision,endDate:education.endDate,endPrecision:education.endPrecision})
      .from(education).where(eq(education.personId,id)).orderBy(asc(education.sortIndex)),
    postgresUserNoteReader(directSql)(id),
  ]);
  return {...p,notes,roles,schools,authoredNotes};
}
export type PersonView=NonNullable<Awaited<ReturnType<typeof loadPerson>>>;
