import type postgres from "postgres";
import { z } from "zod";
export interface AuthoredNoteRow{id:string;body:string}
/** Current direct Person notes only; original/revised text remains in the inspection/export history. */
export async function readUserNotesTransaction(sql:postgres.TransactionSql,personId:string){
    const id=z.uuid().parse(personId).toLowerCase();
      const rows=await sql<AuthoredNoteRow[]>`select o.id,o.body_text as body from public.observation o
        join public.object_ref r on r.id=o.id join public.object_ref p on p.id=o.subject_id
        where o.subject_id=${id} and o.truth_layer='user' and o.semantic_role in ('note','reason_for_noticing')
          and r.archived_at is null
          and not exists(select 1 from public.object_alias a where a.former_object_id in (o.id,o.subject_id))
          and not exists(select 1 from public.observation_review v where v.observation_id=o.id)
          and not exists(select 1 from public.observation newer where newer.supersedes_id=o.id)
        order by o.recorded_at desc,o.id limit 201`;
      if(rows.length>200)throw new Error("USER_NOTE_READ_LIMIT");
      return {rows:[...rows]};
}
export function postgresUserNoteReader(connection:ReturnType<typeof postgres>){
  return async(personId:string):Promise<AuthoredNoteRow[]>=>{
    const result=await connection.begin("isolation level repeatable read read only",async sql=>{
      await sql`set local statement_timeout = '15s'`;
      const [guard]=await sql`select current_setting('transaction_read_only') as mode`;
      if(guard!.mode!=='on')throw new Error("USER_NOTES_NOT_READ_ONLY");
      return readUserNotesTransaction(sql,personId);
    });return result.rows;
  };
}
